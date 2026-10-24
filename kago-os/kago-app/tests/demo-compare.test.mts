// DEMO-07 (#118): the comparison screen's calculation, on the real DATA-01 + DEMO-05 seeds (PGlite)
// with the real APP-04 rules. Expected results are #112's table (docs/specs/app-coupon-targeting.md).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { createDemoDatabase, userId } from "./fixtures/demo-database.mts";
import { buildPurchaseSummaries } from "../src/features/recommendations/customer.ts";
import { compareCoupon, DEMO_TRIGGER_CODE, offersForHypotheticalCart, regularProductIds } from "../src/features/offers/demo-compare.ts";
import type { CouponHistory } from "../src/features/offers/targeting.ts";
import type { StoreOffer } from "../src/features/offers/contracts.ts";
import type { PurchaseOrder } from "../src/features/account/contracts.ts";
import type { AssociationRuleSet } from "../src/features/recommendations/association.ts";

const rules = JSON.parse(await readFile(new URL("../src/features/recommendations/association-rules.json", import.meta.url), "utf8")) as AssociationRuleSet;
const BASIL = "2900000000179", EGGS = "2900000000063", SAUCE = "2900000000162";
const STORE = "0da7a001-0000-4000-8000-000000000001", AS_OF = "2026-10-25T12:00:00+09:00";
const U3 = "0de005aa-0000-4000-8000-000000000003";

const demo = await createDemoDatabase();
after(() => demo.db.close());
await demo.seed();
await demo.db.query("insert into auth.users(id,email,raw_app_meta_data) values ($1,'yui.suzuki@example.test',$2)", [U3, { kago: { roles: ["customer"] } }]);
await demo.db.exec(await readFile(new URL("../../kago-core/supabase/seed/demo05_users_offers.sql", import.meta.url), "utf8"));

// The DEMO-05 store offers in app_list_offers' shape (discount computed by the DB function).
const offers = (await demo.db.query<{ value: StoreOffer }>(`select jsonb_build_object('offerId',o.id,'kind',o.kind,'headline',o.headline,
  'discountPercent',o.discount_percent,'discountAmount',o.discount_amount,'unitDiscount',public.kago_offer_unit_discount(sp.price,o.discount_percent,o.discount_amount),
  'startsAt',o.starts_at,'endsAt',o.ends_at,'trigger',null,'productInCart',false,'triggerInCart',false,'dismissed',false,
  'product',jsonb_build_object('productId',p.id,'code',p.code,'name',p.name,'category',p.category,'price',sp.price,'available',sp.is_active)) as value
  from store_offers o join products p on p.id=o.product_id join store_products sp on sp.store_id=o.store_id and sp.product_id=o.product_id
  where o.store_id=$1 and o.id::text like '0de00506-%' order by o.id`, [STORE])).rows.map(r => r.value);
const trigger = (await demo.db.query<{ code: string; name: string }>("select code,name from products where code=$1", [DEMO_TRIGGER_CODE])).rows[0];
const productId = async (code: string) => (await demo.db.query<{ id: string }>("select id from products where code=$1", [code])).rows[0].id;

// Same steps as loadCouponHistory: settings first, history only when allowed.
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
const people = { U2: userId("U2"), U1: userId("U1"), U3 };

test("#112 expected table: 田中 → 生バジル, 佐藤 → 新鮮たまご, 鈴木 → トマトパスタソース", async () => {
  const chosen: Record<string, string | undefined> = {};
  for (const [key, user] of Object.entries(people)) chosen[key] = compareCoupon({ offers, trigger, history: await historyOf(user), rules }).selected?.productCode;
  assert.deepEqual(chosen, { U2: BASIL, U1: EGGS, U3: SAUCE });
});

test("the real cart and this visit's dismissals do not change the comparison (same hypothetical cart for all)", async () => {
  // After a rehearsal: basil already in the cart, eggs dismissed, pasta not in the cart.
  const used = offers.map(o => ({ ...o, productInCart: o.product.code === BASIL, dismissed: o.product.code === EGGS }));
  assert.equal(compareCoupon({ offers: used, trigger, history: await historyOf(people.U1), rules }).selected?.productCode, EGGS);
  assert.equal(compareCoupon({ offers: used, trigger, history: await historyOf(people.U2), rules }).selected?.productCode, BASIL);
  const flags = offersForHypotheticalCart([{ ...offers[0], trigger: { ...offers[0].product, code: DEMO_TRIGGER_CODE, unitDiscount: 0 } }], DEMO_TRIGGER_CODE)[0];
  assert.deepEqual([flags.productInCart, flags.triggerInCart, flags.dismissed], [false, true, false]);
});

test("a rate changed in Insight is reflected: sauce at 30% wins for 田中", async () => {
  const raised = offers.map(o => o.product.code === SAUCE ? { ...o, discountPercent: 30, unitDiscount: Math.floor(o.product.price * 0.3) } : o);
  assert.equal(compareCoupon({ offers: raised, trigger, history: await historyOf(people.U2), rules }).selected?.productCode, SAUCE);
});

test("score breakdown and regular purchases are shown only from allowed history", async () => {
  const sato = await historyOf(people.U1);
  assert.deepEqual(regularProductIds(sato).sort(), [await productId(BASIL), await productId(SAUCE)].sort());
  assert.deepEqual(regularProductIds(await historyOf(people.U2)), []);
  const d = compareCoupon({ offers, trigger, history: sato, rules });
  const s = d.selected!;
  assert.ok(Math.abs(s.score - Math.round(s.breakdown.association * s.breakdown.novelty * s.breakdown.deal * 1e6) / 1e6) < 1e-9);
  assert.deepEqual(d.excluded.filter(e => e.reason === "regular_purchase").map(e => e.productCode).sort(), [BASIL, SAUCE].sort());
});
