import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { createDemoDatabase, userId } from "./fixtures/demo-database.mts";
import { buildPurchaseSummaries } from "../src/features/recommendations/customer.ts";
import type { PurchaseOrder } from "../src/features/account/contracts.ts";
const demo = await createDemoDatabase();
after(() => demo.db.close());
await demo.seed();
const source = await readFile(new URL("../../kago-core/supabase/seed/demo05_users_offers.sql", import.meta.url), "utf8");
const U3 = "0de005aa-0000-4000-8000-000000000003";
const baseline = await demo.responses();
const seeded = () => demo.db.exec(source);
test("missing U3 refuses before changing any DATA-01 data", async () => {
  await assert.rejects(seeded(), /create all three Auth accounts/);
  await demo.db.exec("rollback");
  assert.deepEqual(await demo.responses(), baseline);
});
test("seed is idempotent, preserves DATA-01 rows, and resolves existing product codes", async () => {
  await demo.db.query("insert into auth.users(id,email,raw_app_meta_data) values ($1,'yui.suzuki@example.test',$2)", [U3, { kago: { roles: ["customer"] } }]);
  // The baseline order/item content is preserved, even though U1 gets extra history.
  const before = await demo.db.query("select to_jsonb(o) as value from orders o order by id");
  await seeded();
  const counts = async () => (await demo.db.query(`select
    (select count(*)::int from orders where id::text like '0de0050d-%') as orders,
    (select count(*)::int from order_items where order_id::text like '0de0050d-%') as lines,
    (select count(*)::int from store_offers where id::text like '0de00506-%') as offers`)).rows[0];
  assert.deepEqual(await counts(), { orders: 7, lines: 14, offers: 3 });
  const first = await demo.db.query("select to_jsonb(o) as value from orders o order by id");
  await seeded();
  assert.deepEqual(await demo.db.query("select to_jsonb(o) as value from orders o order by id"), first);
  const original = await demo.db.query("select to_jsonb(o) as value from orders o where id::text not like '0de0050d-%' order by id");
  assert.deepEqual(original, before);
  assert.deepEqual(await counts(), { orders: 7, lines: 14, offers: 3 });
  const settings = await demo.db.query<{user_id:string;use_purchase_history:boolean}>("select user_id,use_purchase_history from customer_settings where user_id in ($1,$2,$3)",[userId("U1"),userId("U2"),U3]);
  const byId = new Map(settings.rows.map(r => [r.user_id,r.use_purchase_history]));
  assert.equal(byId.get(userId("U1")), true); assert.equal(byId.get(userId("U2")), false); assert.equal(byId.get(U3), true);
});
test("real purchase summary inputs distinguish weekly, occasional and never-purchased candidates", async () => {
  const history = async (who:string) => (await demo.db.query<{value:PurchaseOrder}>(`select jsonb_build_object('id',o.id,'orderedAt',o.ordered_at,'total',o.total,'dataOrigin',o.data_origin,
    'items',(select jsonb_agg(jsonb_build_object('productId',i.product_id,'name',i.product_name,'unitPrice',i.unit_price,'quantity',i.quantity)) from order_items i where i.order_id=o.id)) as value from orders o where o.user_id=$1`,[who])).rows.map(r => r.value);
  const productId = async (code:string) => (await demo.db.query<{id:string}>("select id from products where code=$1",[code])).rows[0].id;
  const basil = await productId("2900000000179"), sauce = await productId("2900000000162"), eggs=await productId("2900000000063");
  const summaries = async (who:string) => new Map(buildPurchaseSummaries(await history(who),"2026-10-25T12:00:00+09:00").map(s => [s.productId,s]));
  const a=await summaries(userId("U1")),c=await summaries(U3);
  assert.equal(a.get(basil)?.purchaseCount,3); assert.equal(a.get(basil)?.averageIntervalDays,7); assert.equal(a.get(basil)?.daysSinceLastPurchase,1);
  assert.equal(a.get(sauce)?.purchaseCount,3); assert.ok(a.get(eggs)!.daysSinceLastPurchase > a.get(eggs)!.averageIntervalDays!);
  assert.equal(c.get(basil)?.purchaseCount,1); assert.equal(c.get(eggs)?.purchaseCount,1); assert.equal(c.has(sauce),false);
  for (const code of ["2900000000049","2900000000056"]) assert.equal(c.get(await productId(code))?.averageIntervalDays,7);
});
test("an existing offer identity or stopped offer is never silently overwritten", async () => {
  await demo.db.exec("begin; update store_offers set status='inactive' where id='0de00506-0000-4000-8000-000000000001'; commit");
  await assert.rejects(seeded(), /existing offer IDs differ/); await demo.db.exec("rollback");
  assert.equal((await demo.db.query<{status:string}>("select status from store_offers where id='0de00506-0000-4000-8000-000000000001'")).rows[0].status,"inactive");
});
