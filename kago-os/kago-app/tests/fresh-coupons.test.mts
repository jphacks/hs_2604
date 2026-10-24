// #158: coupons on three fresh products, with the real DATA-01 + DEMO-05 + #144 seeds and the APP-04 v2 rules.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { createDemoDatabase, userId } from "./fixtures/demo-database.mts";
import { buildPurchaseSummaries } from "../src/features/recommendations/customer.ts";
import { targetCoupon, type CouponHistory } from "../src/features/offers/targeting.ts";
import type { StoreOffer } from "../src/features/offers/contracts.ts";
import type { PurchaseOrder } from "../src/features/account/contracts.ts";
import type { AssociationRuleSet } from "../src/features/recommendations/association.ts";

const rules = JSON.parse(await readFile(new URL("../src/features/recommendations/association-rules.json", import.meta.url), "utf8")) as AssociationRuleSet;
const seed = (name: string) => readFile(new URL(`../../kago-core/supabase/seed/${name}`, import.meta.url), "utf8");
const demo = await createDemoDatabase();
after(() => demo.db.close());
await demo.seed();
const U3 = "0de005aa-0000-4000-8000-000000000003";
await demo.db.query("insert into auth.users(id,email,raw_app_meta_data) values ($1,'yui.suzuki@example.test',$2)", [U3, { kago: { roles: ["customer"] } }]);
await demo.db.exec(await seed("demo05_users_offers.sql"));
await demo.db.exec(await seed("app_menu_fresh_products.sql"));
const fresh = await seed("app_fresh_coupons.sql");
const STORE = "0da7a001-0000-4000-8000-000000000001", AS_OF = "2026-10-25T12:00:00+09:00";

const offers = async () => (await demo.db.query<{ value: StoreOffer }>(`select jsonb_build_object('offerId',o.id,'kind',o.kind,'headline',o.headline,
  'discountPercent',o.discount_percent,'discountAmount',o.discount_amount,'unitDiscount',public.kago_offer_unit_discount(sp.price,o.discount_percent,o.discount_amount),
  'startsAt',o.starts_at,'endsAt',o.ends_at,'trigger',null,'productInCart',false,'triggerInCart',false,'dismissed',false,
  'product',jsonb_build_object('productId',p.id,'code',p.code,'name',p.name,'category',p.category,'price',sp.price,'available',sp.is_active)) as value
  from store_offers o join products p on p.id=o.product_id join store_products sp on sp.store_id=o.store_id and sp.product_id=o.product_id
  where o.store_id=$1 and o.kind='guerrilla_coupon' and o.status='active' and o.starts_at <= $2::timestamptz and $2::timestamptz < o.ends_at order by o.id`, [STORE, AS_OF])).rows.map(r => r.value);
async function historyOf(user: string): Promise<CouponHistory> {
  const allowed = (await demo.db.query<{ on: boolean }>("select use_purchase_history as on from customer_settings where user_id=$1", [user])).rows[0]?.on;
  if (!allowed) return { status: "disabled" };
  const orders = (await demo.db.query<{ value: PurchaseOrder }>(`select jsonb_build_object('id',o.id,'orderedAt',o.ordered_at,'total',o.total,'dataOrigin',o.data_origin,
    'items',(select jsonb_agg(jsonb_build_object('productId',i.product_id,'name',i.product_name,'unitPrice',i.unit_price,'quantity',i.quantity)) from order_items i where i.order_id=o.id)) as value
    from orders o where o.user_id=$1 and o.store_id=$2 and o.ordered_at < $3 order by o.ordered_at desc limit 50`, [user, STORE, AS_OF])).rows.map(r => r.value);
  if (!orders.length) return { status: "empty" };
  const summaries = buildPurchaseSummaries(orders, AS_OF);
  const categories = Object.fromEntries((await demo.db.query<{ id: string; category: string }>("select id,category from products where id = any($1)", [summaries.map(s => s.productId)])).rows.map(r => [r.id, r.category]));
  return { status: "available", summaries, categories };
}
const nameOf = async (code: string) => (await demo.db.query<{ name: string }>("select name from products where code=$1", [code])).rows[0].name;
const add = async (code: string, history: CouponHistory, list?: StoreOffer[]) =>
  targetCoupon({ offers: list ?? await offers(), triggers: [{ code, name: await nameOf(code) }], cartProductCodes: [code], history, rules });

test("seed adds three coupons once (re-runnable)", async () => {
  const before = (await offers()).length;
  await demo.db.exec(fresh); await demo.db.exec(fresh);
  const after = await offers();
  assert.equal(after.length, before + 3);
  assert.deepEqual(after.filter(o => o.offerId.startsWith("0de0f006")).map(o => [o.product.code, o.discountPercent]),
    [["PLU-5002", 20], ["PLU-5004", 15], ["PLU-5009", 25]]);
});
test("the spaghetti demo is unchanged with the fresh coupons: 田中 basil, 佐藤 eggs, 鈴木 sauce", async () => {
  const chosen = [];
  for (const user of [userId("U2"), userId("U1"), U3]) {
    const d = await add("2900000000100", await historyOf(user));
    assert.ok(d.excluded.filter(e => e.productCode.startsWith("PLU-5")).every(e => e.reason === "no_relation"), "no rule from spaghetti to the fresh coupons");
    chosen.push(d.selected?.productCode);
  }
  assert.deepEqual(chosen, ["2900000000179", "2900000000063", "2900000000162"]);
});
test("fresh coupons are chosen by the same score: bread → ham, ground meat → chicken (history OFF)", async () => {
  const off: CouponHistory = { status: "disabled" };
  for (const [trigger, expected] of [["2900000000056", "PLU-5009"], ["PLU-5008", "PLU-5004"]] as const) {
    const d = await add(trigger, off);
    assert.equal(d.selected?.productCode, expected, `${trigger} → ${d.selected?.productCode}`);
    assert.equal(d.selected?.relation.source, "analysis");
    assert.match(d.selected!.reason, /^公開購買データ（Groceries）では/);
  }
});
test("personalised: beef gives 田中 (OFF) basil, but 佐藤 (basil is a regular purchase) the pork coupon", async () => {
  assert.equal((await add("PLU-5007", await historyOf(userId("U2")))).selected?.productCode, "2900000000179");
  const sato = await add("PLU-5007", await historyOf(userId("U1")));
  assert.equal(sato.selected?.productCode, "PLU-5002");
  assert.ok(sato.excluded.some(e => e.productCode === "2900000000179" && e.reason === "regular_purchase"));
});
