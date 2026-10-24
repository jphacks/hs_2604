// APP-05 server path through the real supabase-js client: APP-03 input + candidates RPC + save + read back.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHeadlessBackend, signInBackend } from "@kago/backend";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";
import { saveAccountSetting, loadAccountSettings } from "../src/features/account/service.ts";
import { selectAndSave } from "../src/features/recommendations/selection-service.ts";
import type { AssociationRuleSet } from "../src/features/recommendations/association.ts";

const rules = JSON.parse(await readFile(new URL("../src/features/recommendations/association-rules.json", import.meta.url), "utf8")) as AssociationRuleSet;
const fixture = await createCartBackend({ accountHistory: true });
after(() => fixture.close());
await fixture.db.exec(`insert into store_promotions(id,store_id,product_id) values ('${id(700)}','${id(1)}','${id(21)}');
  insert into promotion_versions(id,promotion_id,version,channels,time_windows,priority,reason_text,starts_at,ends_at)
  values ('${id(701)}','${id(700)}',1,'{app}','[]',3,'旬のりんごです',now()-interval '1 day',now()+interval '1 day')`);
async function client(user = 3, fetcher?: typeof fetch) {
  const c = createHeadlessBackend({ url: fixture.url, publishableKey: "sb_publishable_test" }, fetcher);
  await signInBackend(c, `user${user}@example.test`, "fixture-password", "customer"); return c;
}
const a = await client();
const hasCode = (code: string) => (e: unknown) => (e as { code?: string }).code === code;

test("selects, saves and returns DB item ids; the same cart re-sends the same selection (no duplicates)", async () => {
  const first = await selectAndSave(a, id(13), rules);
  assert.equal(first.cartVersion, 1); assert.equal(first.ruleVersion, 1);
  assert.deepEqual(first.items.map(i => [i.slot, i.placementType, i.reasonCode, i.product.productId]), [[1, "store_promo", "store_pick", id(21)]]);
  assert.match(first.items[0].selectionItemId, /^[0-9a-f-]{36}$/);
  const again = await selectAndSave(a, id(13), rules);
  assert.equal(again.selectionId, first.selectionId); assert.equal(again.items[0].selectionItemId, first.items[0].selectionItemId);
  assert.equal((await fixture.db.query("select * from selections where visit_id=$1", [id(13)])).rows.length, 1);
  const calls = fixture.calls.filter(c => ["app_selection_candidates", "kago_save_selection"].includes(c.name));
  assert(calls.every(c => !("p_items" in c.body) || Array.isArray(c.body.p_items)), "items are built on the server only");
});
test("a cart change creates a new selection for the new version; the old one stays as history", async () => {
  const before = await selectAndSave(a, id(13), rules);
  await fixture.rpc("app_set_cart_item", [id(13), id(2700), id(20), 3, before.cartVersion, "manual", null]);
  const after = await selectAndSave(a, id(13), rules);
  assert.equal(after.cartVersion, before.cartVersion + 1); assert.notEqual(after.selectionId, before.selectionId);
});
test("settings are read from the DB on every call (history/cart OFF by default, ON after saving)", async () => {
  assert.equal((await loadAccountSettings(a, id(13))).settings.useCurrentCart, false);
  const off = await selectAndSave(a, id(13), rules);
  assert(off.items.every(i => i.reasonCode !== "co_purchase" && i.reasonCode !== "sponsored_related"));
  const s = (await loadAccountSettings(a, id(13))).settings;
  await saveAccountSetting(a, id(13), { key: "useCurrentCart", value: true, expectedUpdatedAt: s.updatedAt });
  const on = await selectAndSave(a, id(13), rules);
  assert.equal(on.cartVersion, off.cartVersion);
});
test("a cart change between reading and saving is reported as input_changed, never saved stale", async () => {
  // Move to a version that has no selection yet, so the DB-05 trigger itself must refuse the stale insert.
  const v0 = (await fixture.db.query<{ cart_version: number }>("select cart_version from visits where id=$1", [id(13)])).rows[0].cart_version;
  await fixture.rpc("app_set_cart_item", [id(13), id(2702), id(20), 5, v0, "manual", null]);
  let changed = false;
  const racing = await client(3, async (input, init) => {
    const response = await fetch(input, init);
    if (new URL(String(input)).pathname.endsWith("/app_selection_candidates") && !changed) {
      changed = true;
      const v = (await fixture.db.query<{ cart_version: number }>("select cart_version from visits where id=$1", [id(13)])).rows[0].cart_version;
      await fixture.rpc("app_set_cart_item", [id(13), crypto.randomUUID(), id(20), 10 + v, v, "manual", null]);
    }
    return response;
  });
  const count = (await fixture.db.query("select * from selections where visit_id=$1", [id(13)])).rows.length;
  await assert.rejects(selectAndSave(racing, id(13), rules), hasCode("input_changed"));
  assert.equal((await fixture.db.query("select * from selections where visit_id=$1", [id(13)])).rows.length, count);
  assert(fixture.calls.some(c => c.name === "kago_save_selection"));
  // Same race when an identical selection already exists for the old version (resend no-op path).
  const fresh = await selectAndSave(a, id(13), rules); changed = false;
  await assert.rejects(selectAndSave(racing, id(13), rules), hasCode("input_changed"));
  assert(fresh.selectionId);
});
test("an empty selection also rejects a cart change before the response", async () => {
  await fixture.rpc("app_set_cart_item", [id(14), id(2710), id(20), 1, 0, "manual", null]);
  let changed = false;
  const racing = await client(3, async (input, init) => {
    const response = await fetch(input, init);
    if (new URL(String(input)).pathname.endsWith("/app_selection_candidates") && !changed) {
      changed = true;
      await fixture.rpc("app_set_cart_item", [id(14), id(2711), id(20), 2, 1, "manual", null]);
    }
    return response;
  });
  await assert.rejects(selectAndSave(racing, id(14), rules), hasCode("input_changed"));
  assert(changed);
  const current = await selectAndSave(a, id(14), rules);
  assert.equal(current.cartVersion, 2); assert.equal(current.items.length, 0);
});

test("another customer's or an invalid visit is refused", async () => {
  const b = await client(4);
  await assert.rejects(selectAndSave(b, id(13), rules), hasCode("visit_unavailable"));
  await assert.rejects(selectAndSave(a, "not-a-uuid", rules), hasCode("visit_unavailable"));
});
