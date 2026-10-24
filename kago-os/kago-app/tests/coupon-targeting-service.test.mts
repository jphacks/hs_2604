// DEMO-02 (#116) server path through the real supabase-js client: app_list_offers (real migrations) +
// APP-03 loadRecommendationInput + targeting. Auth/PostgREST HTTP are the test adapter.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createHeadlessBackend, signInBackend } from "@kago/backend";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";
import { OFFER, PRODUCT } from "./fixtures/offers.mts";
import { loadAccountSettings, saveAccountSetting } from "../src/features/account/service.ts";
import { loadSerendipityOffers } from "../src/features/offers/service.ts";
import { readFile } from "node:fs/promises";
import type { AssociationRuleSet } from "../src/features/recommendations/association.ts";

const ASSOCIATION_RULES = JSON.parse(await readFile(new URL("../src/features/recommendations/association-rules.json", import.meta.url), "utf8")) as AssociationRuleSet;

const fixture = await createCartBackend({ accountHistory: true, offers: true });
after(() => fixture.close());
const c = createHeadlessBackend({ url: fixture.url, publishableKey: "sb_publishable_test" });
await signInBackend(c, "user3@example.test", "fixture-password", "customer");
const visit = id(13);
// User 3 bought basil once two days ago (on top of the shared milk history).
await fixture.db.exec(`insert into visits(id,user_id,store_id,status,started_at,ended_at,last_activity_at)
  values ('${id(1900)}','${id(3)}','${id(1)}','completed',now()-interval '2 days 1 hour',now()-interval '2 days',now()-interval '2 days');
  insert into orders(id,visit_id,user_id,store_id,ordered_at,total,idempotency_key,cart_version,data_origin)
  values ('${id(1901)}','${id(1900)}','${id(3)}','${id(1)}',now()-interval '2 days',198,'${id(1902)}',1,'seeded');
  insert into order_items(order_id,product_id,product_name,unit_price,quantity) values ('${id(1901)}','${PRODUCT.basil}','生バジル',198,1)`);
const version = async () => (await fixture.db.query<{ cart_version: number }>("select cart_version from visits where id=$1", [visit])).rows[0].cart_version;
await fixture.rpc("app_set_cart_item", [visit, id(1910), PRODUCT.pasta, 1, await version(), "scan", null]);
const historyCalls = () => fixture.calls.filter(call => call.name === "orders").length;
const setHistory = async (value: boolean) => {
  const s = (await loadAccountSettings(c, visit)).settings;
  await saveAccountSetting(c, visit, { key: "usePurchaseHistory", value, expectedUpdatedAt: s.updatedAt });
};

test("history OFF (default): the history is never requested and the reason does not mention it", async () => {
  const before = historyCalls();
  const r = await loadSerendipityOffers(c, visit, ASSOCIATION_RULES);
  assert.equal(historyCalls(), before, "no orders request when history use is OFF");
  assert.equal(r.coupon?.offerId, OFFER.coupon);
  assert.equal(r.coupon?.targeting?.noveltyReason, "history_disabled");
  assert.equal(r.coupon?.targeting?.trigger.code, "2900000000100");
  assert.doesNotMatch(r.coupon!.reason, /購入|履歴|定期/);
});
test("history ON: the same coupon now uses the purchase (bought before → 0.6); OFF again stops using it", async () => {
  await setHistory(true);
  const before = historyCalls();
  const on = await loadSerendipityOffers(c, visit, ASSOCIATION_RULES);
  assert.ok(historyCalls() > before);
  assert.equal(on.coupon?.targeting?.noveltyReason, "purchased_before");
  assert.deepEqual(on.coupon?.targeting?.breakdown, { association: 1.5, novelty: 0.6, deal: 1.25 });
  assert.match(on.coupon!.reason, /以前購入したことがあり/);
  await setHistory(false);
  const off = await loadSerendipityOffers(c, visit, ASSOCIATION_RULES);
  assert.equal(off.coupon?.targeting?.noveltyReason, "history_disabled");
});
test("a coupon dismissed in this visit (recorded in the DB) is excluded on the server", async () => {
  await fixture.rpc("app_record_offer_event", [visit, id(1920), OFFER.coupon, "offer_dismissed"], 3);
  const r = await loadSerendipityOffers(c, visit, ASSOCIATION_RULES);
  assert.equal(r.coupon, null);
  assert.ok(r.sets.length > 0, "set deals and time sales are unchanged");
});
