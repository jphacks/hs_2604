// DEMO-02 (#116): per-customer coupon targeting. Spec: docs/specs/app-coupon-targeting.md.
// Part 1 uses the real DATA-01 + DEMO-05 (#113 / PR #126) seeds on PGlite with the real APP-04 rules;
// part 2 checks each rule of the score on small hand-made inputs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { createDemoDatabase, userId } from "./fixtures/demo-database.mts";
import { buildPurchaseSummaries, type ProductPurchaseSummary } from "../src/features/recommendations/customer.ts";
import { DEMO_PINNED_COUPONS, targetCoupon, isRegularPurchase, type CouponHistory, type CouponTargetingInput } from "../src/features/offers/targeting.ts";
import { rankSerendipity } from "../src/features/offers/serendipity.ts";
import type { OfferList, StoreOffer } from "../src/features/offers/contracts.ts";
import type { PurchaseOrder } from "../src/features/account/contracts.ts";
import type { AssociationRuleSet } from "../src/features/recommendations/association.ts";

const rules = JSON.parse(await readFile(new URL("../src/features/recommendations/association-rules.json", import.meta.url), "utf8")) as AssociationRuleSet;
const PASTA = "2900000000100", BASIL = "2900000000179", EGGS = "2900000000063", SAUCE = "2900000000162";
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);
const lift = (from: string, to: string) => rules.rules.find(r => r.from === from && r.to === to && r.origin === "analysis")!.lift!;

// ---------------------------------------------------------------- Part 1: the three demo customers (real seeds)
const demo = await createDemoDatabase();
after(() => demo.db.close());
await demo.seed();
const U3 = "0de005aa-0000-4000-8000-000000000003";
await demo.db.query("insert into auth.users(id,email,raw_app_meta_data) values ($1,'yui.suzuki@example.test',$2)", [U3, { kago: { roles: ["customer"] } }]);
await demo.db.exec(await readFile(new URL("../../kago-core/supabase/seed/demo05_users_offers.sql", import.meta.url), "utf8"));
const STORE = "0da7a001-0000-4000-8000-000000000001";
const AS_OF = "2026-10-25T12:00:00+09:00"; // DEMO-05 rehearsal reference (visit start)

// The DEMO-05 store offers as app_list_offers returns them (discount computed by the DB function).
const demoOffers = (await demo.db.query<{ value: StoreOffer }>(`select jsonb_build_object('offerId',o.id,'kind',o.kind,'headline',o.headline,
  'discountPercent',o.discount_percent,'discountAmount',o.discount_amount,'unitDiscount',public.kago_offer_unit_discount(sp.price,o.discount_percent,o.discount_amount),
  'startsAt',o.starts_at,'endsAt',o.ends_at,'trigger',null,'productInCart',false,'triggerInCart',false,'dismissed',false,
  'product',jsonb_build_object('productId',p.id,'code',p.code,'name',p.name,'category',p.category,'price',sp.price,'available',sp.is_active)) as value
  from store_offers o join products p on p.id=o.product_id join store_products sp on sp.store_id=o.store_id and sp.product_id=o.product_id
  where o.store_id=$1 and o.id::text like '0de00506-%' order by o.id`, [STORE])).rows.map(r => r.value);
const pasta = (await demo.db.query<{ code: string; name: string }>("select code,name from products where code=$1", [PASTA])).rows[0];

// Same steps as loadRecommendationInput + loadCouponHistory: settings first, history only when allowed.
async function historyOf(user: string, asOf = AS_OF): Promise<CouponHistory> {
  const allowed = (await demo.db.query<{ on: boolean }>("select use_purchase_history as on from customer_settings where user_id=$1", [user])).rows[0]?.on;
  if (!allowed) return { status: "disabled" };
  const orders = (await demo.db.query<{ value: PurchaseOrder }>(`select jsonb_build_object('id',o.id,'orderedAt',o.ordered_at,'total',o.total,'dataOrigin',o.data_origin,
    'items',(select jsonb_agg(jsonb_build_object('productId',i.product_id,'name',i.product_name,'unitPrice',i.unit_price,'quantity',i.quantity)) from order_items i where i.order_id=o.id)) as value
    from orders o where o.user_id=$1 and o.store_id=$2 and o.ordered_at < $3 order by o.ordered_at desc limit 50`, [user, STORE, asOf])).rows.map(r => r.value);
  if (!orders.length) return { status: "empty" };
  const summaries = buildPurchaseSummaries(orders, asOf);
  const categories = Object.fromEntries((await demo.db.query<{ id: string; category: string }>("select id,category from products where id = any($1)", [summaries.map(s => s.productId)])).rows.map(r => [r.id, r.category]));
  return { status: "available", summaries, categories };
}
const addPasta = (history: CouponHistory, offers = demoOffers) => targetCoupon({ offers, triggers: [pasta], cartProductCodes: [PASTA], history, rules });
const scoreOf = (decision: ReturnType<typeof addPasta>, code: string) => decision.candidates.find(c => c.productCode === code)?.score;

test("1. U2 田中（履歴OFF）: all novelty 1.0 → 生バジル", async () => {
  const d = addPasta(await historyOf(userId("U2")));
  assert.equal(d.historyStatus, "disabled");
  assert.equal(d.selected?.productCode, BASIL);
  close(scoreOf(d, BASIL)!, 1.5 * 1 * 1.25);
  close(scoreOf(d, EGGS)!, Math.round(lift(PASTA, EGGS) * 1.2 * 1e6) / 1e6);
  close(scoreOf(d, SAUCE)!, 1.5 * 1 * 1.15);
  assert.ok(d.candidates.every(c => c.noveltyReason === "history_disabled"));
  assert.doesNotMatch(d.selected!.reason, /購入|履歴|定期/);
  assert.equal(d.selected!.reason, "スパゲッティの仕上げに合います（KAGOが登録した組み合わせ）。25%OFFでお得なため選ばれました。");
});
test("2. U1 佐藤: basil and sauce are regular purchases (excluded), eggs bought before → 新鮮たまご", async () => {
  const history = await historyOf(userId("U1"));
  const d = addPasta(history);
  assert.equal(d.selected?.productCode, EGGS);
  assert.deepEqual(d.excluded.filter(e => e.reason === "regular_purchase").map(e => e.productCode).sort(), [SAUCE, BASIL].sort());
  assert.equal(d.selected!.noveltyReason, "purchased_before");
  assert.deepEqual(d.selected!.breakdown, { association: lift(PASTA, EGGS), novelty: 0.6, deal: 1.2 });
  close(d.selected!.score, Math.round(lift(PASTA, EGGS) * 0.6 * 1.2 * 1e6) / 1e6);
  assert.equal(d.selected!.relation.source, "analysis");
  assert.equal(d.selected!.reason, "公開購買データ（Groceries）ではスパゲッティと一緒に買われやすい組み合わせです。"
    + "以前購入したことがあり、定期的には購入していない商品です。20%OFFでお得なため選ばれました。定期的に購入している商品は候補から外しています。");
});
test("U1 before the third weekly purchase (visit started 10/24 11:00): basil is not yet regular → 生バジル (spec note)", async () => {
  const d = addPasta(await historyOf(userId("U1"), "2026-10-24T11:00:00+09:00"));
  assert.equal(d.selected?.productCode, BASIL); assert.equal(d.selected?.noveltyReason, "purchased_before");
  close(d.selected!.score, 1.5 * 0.6 * 1.25);
});
test("3. U3 鈴木: basil and eggs bought once, sauce never → トマトパスタソース", async () => {
  const d = addPasta(await historyOf(U3));
  assert.equal(d.selected?.productCode, SAUCE);
  close(scoreOf(d, BASIL)!, 1.5 * 0.6 * 1.25);
  close(scoreOf(d, EGGS)!, Math.round(lift(PASTA, EGGS) * 0.6 * 1.2 * 1e6) / 1e6);
  close(scoreOf(d, SAUCE)!, 1.5 * 1 * 1.15);
  assert.equal(d.selected!.noveltyReason, "never_purchased");
  assert.equal(d.selected!.reason, "スパゲッティと一緒に使えます（KAGOが登録した組み合わせ）。まだ購入したことのない商品です。15%OFFでお得なため選ばれました。");
  assert.doesNotMatch(d.selected!.reason, /子育て|家族|年齢|性別/);
});
test("the same pasta gives three different coupons; changing the store rate changes the result (#118)", async () => {
  const chosen = await Promise.all([userId("U2"), userId("U1"), U3].map(async u => addPasta(await historyOf(u)).selected?.productCode));
  assert.deepEqual(chosen, [BASIL, EGGS, SAUCE]);
  // U2: sauce at 30% beats basil at 25% (1.5×1.30=1.95 > 1.875).
  const raised = demoOffers.map(o => o.product.code === SAUCE ? { ...o, discountPercent: 30, unitDiscount: Math.floor(o.product.price * 0.3) } : o);
  assert.equal(addPasta(await historyOf(userId("U2")), raised).selected?.productCode, SAUCE);
});

// ---------------------------------------------------------------- Part 2: rules on hand-made inputs
const product = (code: string, name: string, category: string, price = 200) => ({ productId: `p-${code}`, code, name, category, price, available: true });
const P = { pasta: product(PASTA, "スパゲッティ 500g", "乾麺"), basil: product(BASIL, "生バジル", "青果"), eggs: product(EGGS, "新鮮たまご 10個", "卵"),
  sauce: product(SAUCE, "トマトパスタソース", "調味料"), onion: product("PLU-1001", "玉ねぎ 1個", "青果"), apple: product("PLU-APPLE", "検証りんご", "青果") };
const coupon = (offerId: string, p: typeof P.basil, percent = 20, extra: Partial<StoreOffer> = {}): StoreOffer => ({
  offerId, kind: "guerrilla_coupon", headline: offerId, discountPercent: percent, discountAmount: null, unitDiscount: Math.floor(p.price * percent / 100),
  startsAt: "2026-10-25T00:00:00Z", endsAt: "2026-10-26T00:00:00Z", product: p, trigger: null, productInCart: false, triggerInCart: false, ...extra });
const summary = (p: { productId: string }, purchaseCount: number, averageIntervalDays: number | null, daysSinceLastPurchase: number): ProductPurchaseSummary =>
  ({ productId: p.productId, purchaseCount, totalQuantity: purchaseCount, lastPurchasedAt: "2026-10-20T00:00:00Z", averageIntervalDays, daysSinceLastPurchase });
const available = (summaries: ProductPurchaseSummary[]): CouponHistory =>
  ({ status: "available", summaries, categories: Object.fromEntries(Object.values(P).map(p => [p.productId, p.category])) });
const three = [coupon("o-basil", P.basil, 25), coupon("o-eggs", P.eggs, 20), coupon("o-sauce", P.sauce, 15)];
const run = (extra: Partial<CouponTargetingInput> = {}) => targetCoupon({ offers: three, triggers: [{ code: PASTA, name: P.pasta.name }], cartProductCodes: [PASTA], history: { status: "disabled" }, rules, ...extra });

test("4. history OFF: whatever the history contains, the result and reasons are identical", () => {
  const off = run();
  // The service passes only { status: "disabled" } when OFF; even if history leaked in, it would be ignored.
  const leaked = { status: "disabled", summaries: [summary(P.basil, 4, 7, 1), summary(P.sauce, 1, null, 3)], categories: { [P.onion.productId]: "青果" } } as unknown as CouponHistory;
  assert.deepEqual(run({ history: leaked }), off);
  assert.equal(off.selected?.offerId, "o-basil");
  for (const c of off.candidates) { assert.equal(c.breakdown.novelty, 1); assert.doesNotMatch(c.reason, /購入|履歴|定期/); }
});
test("5. regular purchases are never candidates; average interval null or long gaps are not regular", () => {
  assert.equal(isRegularPurchase(summary(P.basil, 3, 7, 10.5)), true);
  assert.equal(isRegularPurchase(summary(P.basil, 3, 7, 10.6)), false);
  assert.equal(isRegularPurchase(summary(P.basil, 2, 7, 1)), false);
  assert.equal(isRegularPurchase(summary(P.basil, 5, null, 1)), false);
  const d = run({ history: available([summary(P.basil, 4, 7, 2)]) });
  assert.ok(!d.candidates.some(c => c.productCode === BASIL));
  assert.deepEqual(d.excluded, [{ offerId: "o-basil", productCode: BASIL, reason: "regular_purchase" }]);
  // Basil (青果) is bought, onion is not; same-category gets 1.3. History empty → neutral 1.0.
  const cat = run({ offers: [coupon("o-basil", P.basil, 25)], history: available([summary(P.onion, 1, null, 30)]) });
  assert.equal(cat.selected?.noveltyReason, "same_category"); close(cat.selected!.score, 1.5 * 1.3 * 1.25);
  assert.equal(run({ history: { status: "empty" } }).selected?.noveltyReason, "history_empty");
});
test("6–8. products in the cart, coupons already received (DB) and dismissed coupons are not candidates", () => {
  const inCart = run({ offers: [coupon("o-basil", P.basil, 25, { productInCart: true }), three[1]] });
  assert.equal(inCart.selected?.offerId, "o-eggs");
  assert.equal(run({ cartProductCodes: [PASTA, BASIL] }).candidates.some(c => c.productCode === BASIL), false);
  // Claimed coupons are removed by app_list_offers itself; the per-visit cap (3) is applied here.
  assert.equal(run({ claimedCouponCount: 3 }).selected, null);
  assert.equal(run({ claimedCouponCount: 2 }).selected?.offerId, "o-basil");
  assert.equal(run({ dismissedOfferIds: ["o-basil"] }).selected?.offerId, "o-sauce");
  assert.equal(run({ offers: [{ ...three[0], dismissed: true }, three[2]] }).selected?.offerId, "o-sauce");
});
test("9. no rule from t to the product → not a candidate (the store trigger counts only when it is t)", () => {
  const d = run({ offers: [coupon("o-apple", P.apple, 50)] });
  assert.equal(d.selected, null); assert.equal(d.excluded[0].reason, "no_relation");
  const store = run({ offers: [coupon("o-apple", P.apple, 50, { trigger: { ...P.pasta, unitDiscount: 0 }, triggerInCart: true })] });
  assert.equal(store.selected?.relation.source, "store"); close(store.selected!.score, 1.2 * 1.5);
  assert.equal(run({ offers: [coupon("o-apple", P.apple, 50, { trigger: { ...P.pasta, unitDiscount: 0 }, triggerInCart: false })] }).excluded[0].reason, "trigger_missing");
  assert.equal(run({ triggers: [] }).selected, null);
});
test("10. ties are deterministic (product code, then offer id) whatever the input order", () => {
  // 1.5 × 1.0 × 1.2 for both curated pairs: basil (…179) < sauce (…162)? codes compare as strings → sauce first.
  const tie = [coupon("o-z", P.basil, 20), coupon("o-a", P.sauce, 20)];
  const a = run({ offers: tie }), b = run({ offers: [...tie].reverse() });
  assert.equal(a.selected?.productCode, SAUCE); assert.deepEqual(a, b);
  const twoForBasil = [coupon("o-2", P.basil, 20), coupon("o-1", P.basil, 20)];
  assert.equal(run({ offers: twoForBasil }).selected?.offerId, "o-1");
  // 0.1 + 0.2 style float noise does not break a tie (rounded to 1e-6 before comparing).
  assert.equal(run({ offers: [coupon("o-x", P.basil, 20), coupon("o-y", P.sauce, 20.000000001)] }).selected?.productCode, SAUCE);
});
test("11. the store's rate changes Deal and the score; an amount discount uses the DB amount / price", () => {
  close(run({ offers: [coupon("o", P.basil, 10)] }).selected!.score, 1.5 * 1.1);
  close(run({ offers: [coupon("o", P.basil, 40)] }).selected!.score, 1.5 * 1.4);
  const amount = run({ offers: [coupon("o", P.basil, 0, { discountPercent: null, discountAmount: 50, unitDiscount: 50 })] }).selected!;
  close(amount.breakdown.deal, 1.25); assert.match(amount.reason, /50円引き/);
});
test("12. analysis (public data, lift) and initial (curated, 1.5) relations are kept apart", () => {
  const d = run();
  const eggs = d.candidates.find(c => c.productCode === EGGS)!, basil = d.candidates.find(c => c.productCode === BASIL)!;
  assert.deepEqual(eggs.relation, { source: "analysis", ruleId: `grc-${PASTA}-${EGGS}`, lift: lift(PASTA, EGGS), confidence: 0.084 });
  assert.deepEqual(basil.relation, { source: "initial", ruleId: "init-pasta-basil", lift: null, confidence: null });
  assert.match(eggs.reason, /公開購買データ/); assert.doesNotMatch(basil.reason, /公開購買データ/);
  // When both exist for a pair, the public-data lift is used (bread → eggs: analysis 2.233, not the curated 1.5).
  const bread = run({ triggers: [{ code: "2900000000056", name: "もっちり食パン 6枚切" }], cartProductCodes: ["2900000000056"], offers: [three[1]] });
  assert.equal(bread.selected?.relation.source, "analysis"); close(bread.selected!.breakdown.association, lift("2900000000056", EGGS));
});
test("13. APP-13 response: only the selected coupon is returned, with its targeting breakdown", () => {
  const list: OfferList = { visitId: "v", cartVersion: 2, serverTime: "2026-10-25T03:00:00Z", nextChangeAt: null, offers: three,
    cartProductCodes: [PASTA], lastAddedProduct: { productId: P.pasta.productId, code: PASTA, name: P.pasta.name, category: "乾麺" }, claimedCouponCount: 0 };
  // The App pins the demo coupon for spaghetti (#186): tomato sauce whatever the history (the score alone gives basil / eggs, above).
  const off = rankSerendipity(list, rules);
  assert.equal(off.coupon?.offerId, "o-sauce"); assert.equal(off.coupon?.targeting?.noveltyReason, "history_disabled");
  assert.equal(off.coupon?.relation?.origin, "initial");
  const on = rankSerendipity(list, rules, available([summary(P.basil, 3, 7, 1), summary(P.sauce, 3, 7, 1)]));
  assert.equal(on.coupon?.offerId, "o-sauce");
  // The trigger is the last product added, not every product in the cart.
  const lastEggs = rankSerendipity({ ...list, cartProductCodes: [PASTA, EGGS], lastAddedProduct: { ...list.lastAddedProduct!, code: EGGS, name: P.eggs.name } }, rules);
  assert.equal(lastEggs.coupon, null, "eggs → basil/sauce have no rule");
});

test("#186 demo: spaghetti always shows the tomato sauce coupon, unless it is not offered, in the cart, dismissed or over the limit", () => {
  const pinnedCoupons = DEMO_PINNED_COUPONS;
  const regular = available([summary(P.sauce, 3, 7, 1)]);
  assert.equal(run({ history: regular }).selected?.productCode, BASIL, "without the pin, a regular purchase is excluded");
  for (const history of [{ status: "disabled" } as CouponHistory, { status: "empty" } as CouponHistory, regular]) {
    const d = run({ history, pinnedCoupons });
    assert.equal(d.selected?.offerId, "o-sauce"); assert.equal(d.candidates[0].offerId, "o-sauce");
    assert.equal(new Set(d.candidates.map(c => c.offerId)).size, d.candidates.length);
    assert.match(d.selected!.reason, /^スパゲッティと一緒に使えるクーポンです。15%OFFでお得です。$/);
  }
  assert.equal(run({ pinnedCoupons, offers: three.filter(o => o.offerId !== "o-sauce") }).selected?.offerId, "o-basil");
  assert.equal(run({ pinnedCoupons, cartProductCodes: [PASTA, SAUCE] }).selected?.offerId, "o-basil");
  assert.equal(run({ pinnedCoupons, dismissedOfferIds: ["o-sauce"] }).selected?.offerId, "o-basil");
  assert.equal(run({ pinnedCoupons, claimedCouponCount: 3 }).selected, null);
  assert.equal(run({ pinnedCoupons, triggers: [{ code: EGGS, name: P.eggs.name }] }).selected?.offerId === "o-sauce", false, "other products are not pinned");
});
