// #152 demo data: one extra 佐藤 order (10/18 牛乳・食パン) makes the reminder card show in the demo,
// on the real DATA-01 + DEMO-05 seeds (PGlite), without changing the #112 coupon results.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { createDemoDatabase, userId } from "./fixtures/demo-database.mts";
import { buildPurchaseSummaries } from "../src/features/recommendations/customer.ts";
import { regularReminders } from "../src/features/recommendations/purchase-cycle.ts";
import { targetCoupon, type CouponHistory } from "../src/features/offers/targeting.ts";
import type { StoreOffer } from "../src/features/offers/contracts.ts";
import type { PurchaseOrder } from "../src/features/account/contracts.ts";
import type { AssociationRuleSet } from "../src/features/recommendations/association.ts";

const core = new URL("../../kago-core/supabase/seed/", import.meta.url);
const rules = JSON.parse(await readFile(new URL("../src/features/recommendations/association-rules.json", import.meta.url), "utf8")) as AssociationRuleSet;
const STORE = "0da7a001-0000-4000-8000-000000000001", U3 = "0de005aa-0000-4000-8000-000000000003";
const PASTA = "2900000000100", BASIL = "2900000000179", EGGS = "2900000000063", SAUCE = "2900000000162";
const DEMO = "2026-10-25T12:00:00+09:00";

const demo = await createDemoDatabase();
after(() => demo.db.close());
await demo.seed();
const reminderSeed = await readFile(new URL("demo152_regular_reminder.sql", core), "utf8");

async function ordersOf(user: string, asOf: string) {
  return (await demo.db.query<{ value: PurchaseOrder }>(`select jsonb_build_object('id',o.id,'orderedAt',o.ordered_at,'total',o.total,'dataOrigin',o.data_origin,
    'items',(select jsonb_agg(jsonb_build_object('productId',i.product_id,'name',i.product_name,'unitPrice',i.unit_price,'quantity',i.quantity)) from order_items i where i.order_id=o.id)) as value
    from orders o where o.user_id=$1 and o.store_id=$2 and o.ordered_at < $3 order by o.ordered_at desc limit 50`, [user, STORE, asOf])).rows.map(r => r.value);
}
const historyOn = async (user: string) => (await demo.db.query<{ on: boolean }>("select use_purchase_history as on from customer_settings where user_id=$1", [user])).rows[0]?.on;
async function remindersOf(user: string, asOf = DEMO) {
  if (!await historyOn(user)) return null; // history OFF: the API returns "disabled" without reading orders
  const listings = (await demo.db.query<{ productId: string; code: string; name: string; category: string; price: number }>(`select p.id as "productId",p.code,p.name,p.category,sp.price
    from store_products sp join products p on p.id=sp.product_id where sp.store_id=$1 and sp.is_active`, [STORE])).rows;
  return regularReminders(buildPurchaseSummaries(await ordersOf(user, asOf), asOf), listings, []).map(r => [r.product.code, r.status]);
}
async function couponOf(user: string) {
  let history: CouponHistory = { status: "disabled" };
  if (await historyOn(user)) {
    const summaries = buildPurchaseSummaries(await ordersOf(user, DEMO), DEMO);
    const categories = Object.fromEntries((await demo.db.query<{ id: string; category: string }>("select id,category from products where id = any($1)", [summaries.map(s => s.productId)])).rows.map(r => [r.id, r.category]));
    history = { status: "available", summaries, categories };
  }
  const offers = (await demo.db.query<{ value: StoreOffer }>(`select jsonb_build_object('offerId',o.id,'kind',o.kind,'headline',o.headline,
    'discountPercent',o.discount_percent,'discountAmount',o.discount_amount,'unitDiscount',public.kago_offer_unit_discount(sp.price,o.discount_percent,o.discount_amount),
    'startsAt',o.starts_at,'endsAt',o.ends_at,'trigger',null,'productInCart',false,'triggerInCart',false,'dismissed',false,
    'product',jsonb_build_object('productId',p.id,'code',p.code,'name',p.name,'category',p.category,'price',sp.price,'available',sp.is_active)) as value
    from store_offers o join products p on p.id=o.product_id join store_products sp on sp.store_id=o.store_id and sp.product_id=o.product_id
    where o.store_id=$1 and o.id::text like '0de00506-%' order by o.id`, [STORE])).rows.map(r => r.value);
  const pasta = (await demo.db.query<{ code: string; name: string }>("select code,name from products where code=$1", [PASTA])).rows[0];
  return targetCoupon({ offers, triggers: [pasta], cartProductCodes: [PASTA], history, rules }).selected?.productCode;
}

test("refuses before DEMO-05 is applied", async () => {
  await assert.rejects(demo.db.exec(reminderSeed), /apply DEMO-05 first/);
  await demo.db.exec("rollback");
  assert.equal((await demo.db.query("select * from orders where id::text like '0de1520d-%'")).rows.length, 0);
});

test("without it nobody gets the card on the demo day; with it 佐藤 gets 牛乳・食パン, idempotently", async () => {
  await demo.db.query("insert into auth.users(id,email,raw_app_meta_data) values ($1,'yui.suzuki@example.test',$2)", [U3, { kago: { roles: ["customer"] } }]);
  await demo.db.exec(await readFile(new URL("demo05_users_offers.sql", core), "utf8"));
  assert.deepEqual(await remindersOf(userId("U1")), []);
  await demo.db.exec(reminderSeed);
  await demo.db.exec(reminderSeed);
  const rows = (await demo.db.query<{ n: number }>("select count(*)::int as n from order_items where order_id::text like '0de1520d-%'")).rows[0].n;
  assert.equal(rows, 2);
  assert.equal((await demo.db.query("select * from orders where id::text like '0de1520d-%'")).rows.length, 1);
  assert.deepEqual(await remindersOf(userId("U1")), [["2900000000049", "due"], ["2900000000056", "due"]]);
  assert.deepEqual(await remindersOf(U3), [], "鈴木: weekly 牛乳・パン were bought on 10/24");
  assert.equal(await remindersOf(userId("U2")), null, "田中: history OFF");
});

test("the card window is 10/24 07:00 – 10/29 08:50 JST", async () => {
  assert.deepEqual(await remindersOf(userId("U1"), "2026-10-24T07:00:00+09:00"), []);
  assert.equal((await remindersOf(userId("U1"), "2026-10-24T07:30:00+09:00"))!.length, 2);
  assert.deepEqual((await remindersOf(userId("U1"), "2026-10-26T12:00:00+09:00"))!.map(r => r[1]), ["overdue", "overdue"]);
  assert.equal((await remindersOf(userId("U1"), "2026-10-29T08:30:00+09:00"))!.length, 2);
  assert.deepEqual(await remindersOf(userId("U1"), "2026-10-29T09:00:00+09:00"), []);
});

test("#112 coupon results are unchanged: 田中 → 生バジル, 佐藤 → たまご, 鈴木 → トマトソース", async () => {
  assert.deepEqual([await couponOf(userId("U2")), await couponOf(userId("U1")), await couponOf(U3)], [BASIL, EGGS, SAUCE]);
});
