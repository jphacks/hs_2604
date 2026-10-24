import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { accounts, createDemoDatabase, responsesFile, userId } from "./fixtures/demo-database.mts";

// Applies to a disposable PGlite only. Never point this at a shared or production DB.
const S1 = "0da7a001-0000-4000-8000-000000000001";
const S2 = "0da7a001-0000-4000-8000-000000000002";
type Row = Record<string, unknown>;

const demo = await createDemoDatabase();
after(() => demo.db.close());
await demo.seed();
const first = await demo.responses();
const ids = async (table: string, key = "id") =>
  (await demo.db.query<{ v: string }>(`select ${key}::text as v from public.${table} order by 1`)).rows.map(r => r.v);
const before = await ids("order_items", "order_id || product_id");
await demo.seed();
const r = await demo.responses();

test("a second run adds nothing and changes nothing a role can read", async () => {
  assert.deepEqual(r, first);
  assert.deepEqual(await ids("order_items", "order_id || product_id"), before);
  const counts = (await demo.db.query<Row>(`select
    (select count(*)::int from public.application_revisions) as revisions,
    (select count(*)::int from public.ad_operation_logs) as logs,
    (select count(*)::int from public.events) as events`)).rows[0];
  assert.deepEqual(counts, { revisions: 4, logs: 2, events: 74 });
});

test("mock responses in kago-core match what the DB returns to each role", async () => {
  const file = JSON.parse(await readFile(responsesFile, "utf8"));
  assert.deepEqual(r, file.responses, "run `pnpm generate:demo-responses` after changing the seed");
  for (const [key, a] of Object.entries(accounts)) assert.equal(file.accounts[key].email, a.email);
});

test("App and Ads fixtures name the same products, prices and history", async () => {
  const appProducts = JSON.parse(await readFile(new URL("../src/data/demo/products.json", import.meta.url), "utf8")) as
    { code: string; name: string; price: number; category: string }[];
  const products = new Map((r.U1.products as Row[]).map(p => [p.code, p]));
  const prices = new Map((r.U1.store_products as Row[]).map(sp => [sp.product_id, sp.price]));
  for (const p of appProducts) {
    const row = products.get(p.code);
    assert.ok(row, p.code);
    assert.deepEqual([row.name, row.category, prices.get(row.id)], [p.name, p.category, p.price]);
  }
  const csv = (await readFile(new URL("../../kago-ads/src/data/demo/products.csv", import.meta.url), "utf8"))
    .trim().split("\n").slice(1).map(line => line.split(","));
  assert.deepEqual(csv.map(([code, name, category, price]) => [code, name, category, Number(price)]),
    [...products.values()].map(p => [p.code, p.name, p.category, prices.get(p.id)]));

  const customer = JSON.parse(await readFile(new URL("../src/data/demo/customer.json", import.meta.url), "utf8")) as
    { purchaseHistory: { purchasedAt: string; items: { productCode: string; quantity: number; unitPrice: number }[] }[] };
  const codeOf = new Map([...products.values()].map(p => [p.id, p.code]));
  const seeded = (r.U1.orders as Row[]).toReversed().map(o => ({
    at: Date.parse(o.ordered_at as string),
    items: (r.U1.order_items as Row[]).filter(i => i.order_id === o.id)
      .map(i => [codeOf.get(i.product_id), i.quantity, i.unit_price]).sort(),
  }));
  assert.deepEqual(seeded, customer.purchaseHistory.map(o => ({
    at: Date.parse(o.purchasedAt), items: o.items.map(i => [i.productCode, i.quantity, i.unitPrice]).sort(),
  })));
  assert.ok((r.U1.orders as Row[]).every(o => o.data_origin === "seeded"));
});

test("each role reads only its own customer, store, maker or device rows", () => {
  assert.equal((r.U1.orders as Row[]).length, 11);
  assert.deepEqual([(r.U2.orders as Row[]).length, (r.U2.events as Row[]).length], [0, 0]);
  assert.deepEqual((r.U2.customer_settings as Row[]).map(s => s.use_purchase_history), [false]);
  for (const key of ["T1", "DV1"] as const) assert.equal((r[key].orders as Row[]).length, 0);
  assert.deepEqual(r.T1.order_totals, [{ data_origin: "seeded", orders: 11, quantity: 40, amount: 9430 }]);
  assert.ok((r.T1.ad_calls as Row[]).every(c => c.store_id === S1));
  assert.ok((r.T2.ad_calls as Row[]).every(c => c.store_id === S2));
  // Both stores and both makers own applications, so each side's empty result is real isolation.
  const appIds = (key: "T1" | "T2" | "W1" | "W2") => (r[key].ad_applications as Row[]).map(a => (a.id as string).slice(-2));
  assert.deepEqual([appIds("T1"), appIds("T2"), appIds("W1"), appIds("W2")], [["01", "02"], ["03"], ["01", "02"], ["03"]]);
  assert.ok((r.T2.ad_applications as Row[]).every(a => a.store_id === S2));
  assert.equal((r.T2.ad_placements as Row[]).length, 0);
  assert.deepEqual((r.W2.creatives as Row[]).map(c => c.maker_id), ["0da7a003-0000-4000-8000-000000000002"]);
  assert.ok(!(r.W1.ad_calls as Row[]).some(c => c.status === "draft"), "makers never see draft calls");
  assert.deepEqual((r.DV3.ad_placements as Row[]).length, 0);
  assert.deepEqual((r.DV1.signage_devices as Row[]).map(d => d.slug), ["hiroshima-demo-entrance"]);
  // Customers see only the approved version 2, never the rejected version 1.
  assert.deepEqual((r.U1.creative_versions as Row[]).map(v => v.version), [2]);
});

test("store staff cannot review, and makers cannot resubmit, another store's or maker's application", async () => {
  const A1 = "0da7a008-0000-4000-8000-000000000001", A3 = "0da7a008-0000-4000-8000-000000000003";
  const denied = (error: unknown) => (error as { code?: string }).code === "42501";
  await assert.rejects(demo.as("T1", `select to_jsonb(r) as value from public.kago_approve_application('${A3}', 1) r`), denied);
  await assert.rejects(demo.as("T2", `select to_jsonb(r) as value from public.kago_approve_application('${A1}', 2) r`), denied);
  await assert.rejects(demo.as("T2", `select to_jsonb(r) as value from public.kago_reject_application('${A1}', 2, '確認') r`), denied);
  // RLS hides the row, so the update matches nothing instead of raising.
  assert.deepEqual(await demo.as("W1", `with u as (update public.ad_applications set message = '書換' where id = '${A3}' returning 1)
    select to_jsonb(count(*)) as value from u`), 0);
  // The owning store can review (the transaction is rolled back afterwards).
  assert.equal((await demo.as("T2", `select to_jsonb(r) as value from public.kago_approve_application('${A3}', 1) r`) as Row).replayed, false);
});

test("A1 keeps its review history and PL1 pins the approved version", () => {
  const revisions = (r.T1.application_revisions as Row[]).filter(x => (x.application_id as string).endsWith("01"));
  assert.deepEqual(revisions.map(x => [x.revision, x.status]), [[1, "rejected"], [2, "approved"]]);
  assert.deepEqual((r.T1.ad_operation_logs as Row[]).map(l => l.action), ["reject", "approve"]);
  const [pl1] = r.U1.ad_placements as Row[];
  assert.deepEqual([pl1.status, pl1.creative_version_id, pl1.approved_by],
    ["active", "0da7a007-0000-4000-8000-000000000002", userId("T1")]);
});

test("App DB functions read the seeded catalog with per-store prices", async () => {
  const price = async (store: string) => demo.as("U2", `select (select p->>'price' from jsonb_array_elements(
      public.app_list_products(public.app_start_visit('${store}', false), 'トマト', 0)->'products') p) as value`);
  assert.deepEqual([await price(S1), await price(S2)], ["298", "278"]);
  assert.deepEqual((await demo.db.query("select 1 from public.visits where user_id=$1", [userId("U2")])).rows, [],
    "reads ran in rolled-back transactions");
});

test("missing accounts or a differently configured account stop the seed", async () => {
  const missing = await createDemoDatabase({ skipAccounts: ["W2"] });
  await assert.rejects(missing.seed(), /create these Auth users first: staff\.check-maker@example\.test/);
  await missing.db.exec("rollback");
  assert.deepEqual((await missing.db.query("select 1 from public.stores")).rows, []);
  await missing.db.close();

  const conflicting = await createDemoDatabase();
  await conflicting.db.query(`update auth.users set raw_app_meta_data='{"kago":{"roles":["store_staff"]}}' where id=$1`, [userId("U1")]);
  await assert.rejects(conflicting.seed(), /app_metadata\.kago differs for misaki\.sato@example\.test/);
  await conflicting.db.close();
});
