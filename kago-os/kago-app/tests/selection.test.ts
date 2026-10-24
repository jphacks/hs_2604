// APP-05: fixed-input checks of the slot selection (common spec §7). No DB.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { selectRecommendations, type SelectionInput } from "../src/features/recommendations/selection.ts";
import type { SelectionCandidates } from "../src/features/recommendations/selection-contracts.ts";
import type { AssociationRuleSet } from "../src/features/recommendations/association.ts";
import type { ProductPurchaseSummary } from "../src/features/recommendations/customer.ts";

const rules = JSON.parse(await readFile(new URL("../src/features/recommendations/association-rules.json", import.meta.url), "utf8")) as AssociationRuleSet;
const P = (n: string, code: string, name: string, price = 200) => ({ productId: `p-${n}`, code, name, category: "検証", price });
const PASTA = P("pasta", "2900000000100", "スパゲッティ 500g", 248), SAUCE = P("sauce", "2900000000162", "トマトパスタソース", 298);
const BASIL = P("basil", "2900000000179", "生バジル", 198), MILK = P("milk", "2900000000049", "成分無調整牛乳 1L", 238);
const EGG = P("egg", "2900000000063", "新鮮たまご 10個", 298), BREAD = P("bread", "2900000000056", "もっちり食パン 6枚切", 228);
const CROQ = P("croq", "PLU-2001", "お店のコロッケ 1個", 98), TISSUE = P("tissue", "2900000000131", "箱ティッシュ 5個組", 398);
const YOGURT = P("yogurt", "2900000000070", "プレーンヨーグルト", 188);
const listings = [PASTA, SAUCE, BASIL, MILK, EGG, BREAD, CROQ, TISSUE, YOGURT];
const promo = (product = CROQ, priority = 5, id = "pv-1") => ({ promotionVersionId: id, promotionId: `sp-${id}`, version: 1, productId: product.productId,
  priority, reasonText: "店内で揚げたてです", startsAt: "2026-10-24T00:00:00Z", endsAt: "2026-12-01T00:00:00Z" });
const ad = (product = SAUCE, id = "pl-1") => ({ adPlacementId: id, creativeVersionId: `cv-${id}`, creativeVersion: 2, productId: product.productId,
  headline: "トマトの旨みたっぷり", makerName: "瀬戸内トマト食品", startsAt: "2026-10-23T00:00:00Z", endsAt: "2026-12-01T00:00:00Z" });
const candidates = (o: Partial<SelectionCandidates> = {}): SelectionCandidates => ({
  visit: { id: "v1", store_id: "s1", cart_version: 4, started_at: "2026-10-24T01:00:00Z", experiment_arm: null },
  at: "2026-10-24T08:00:00Z", cart: [], listings, promotions: [], ads: [], popular: [], ...o });
const cart = (...items: typeof PASTA[]) => items.map(i => ({ productId: i.productId, code: i.code }));
const on = { usePurchaseHistory: true, useCurrentCart: true }, off = { usePurchaseHistory: false, useCurrentCart: false };
const summary = (product: typeof PASTA, days: number, interval: number | null, count = 3): ProductPurchaseSummary =>
  ({ productId: product.productId, purchaseCount: count, totalQuantity: count, lastPurchasedAt: "2026-10-01T00:00:00Z", averageIntervalDays: interval, daysSinceLastPurchase: days });
const run = (c: SelectionCandidates, settings = on, summaries: ProductPurchaseSummary[] = []) => selectRecommendations({ candidates: c, settings, summaries } as SelectionInput, rules);
const shape = (r: ReturnType<typeof run>) => r.items.map(i => [i.slot, i.placementType, i.product.code, i.reasonCode]);

test("pasta in the cart: organic co_purchase, the store pick and a related ad — three types with their own reasons", () => {
  const r = run(candidates({ cart: cart(PASTA), promotions: [promo()], ads: [ad()], popular: [{ productId: MILK.productId, orders: 9 }] }));
  assert.deepEqual(shape(r), [[1, "organic", BASIL.code, "co_purchase"], [2, "store_promo", CROQ.code, "store_pick"], [3, "sponsored", SAUCE.code, "sponsored_related"]]);
  assert.equal(r.items[0].reasonText, "スパゲッティの仕上げに合います");
  assert.equal(r.items[1].reasonText, "店内で揚げたてです"); assert.equal(r.items[1].promotionVersionId, "pv-1");
  assert.equal(r.items[2].reasonText, "スパゲッティを選んだ方への広告です");
  assert.deepEqual(r.items[2].sponsor, { makerName: "瀬戸内トマト食品", headline: "トマトの旨みたっぷり", creativeVersionId: "cv-pl-1" });
  assert.equal(r.ruleVersion, 1); assert.equal(r.cartVersion, 4);
  for (const i of r.items) {
    assert.equal(i.placementType === "sponsored", i.reasonCode.startsWith("sponsored_"));
    assert.equal(i.placementType === "store_promo", i.reasonCode.startsWith("store_"));
    assert.equal(i.adPlacementId !== null, i.placementType === "sponsored");
    assert.equal(i.promotionVersionId !== null, i.placementType === "store_promo");
  }
});
test("the same input and rule version always gives the same slots", () => {
  const c = candidates({ cart: cart(PASTA, EGG), promotions: [promo()], ads: [ad()], popular: [{ productId: MILK.productId, orders: 9 }] });
  assert.deepEqual(run(c), run(structuredClone(c)));
  assert.deepEqual(shape(run(c)), shape(run(candidates({ ...c, cart: [...c.cart].reverse() }))));
});
test("an ad unrelated to the cart is not shown; organic fills the slot", () => {
  const r = run(candidates({ cart: cart(PASTA), ads: [ad(TISSUE)] }));
  assert(!r.items.some(i => i.placementType === "sponsored"));
  assert.equal(r.items.length, 3); assert(r.items.every(i => i.placementType === "organic"));
});
test("excluded by the DB (not approved, suspended, expired, unlisted) means absent from candidates, so never selected", () => {
  const r = run(candidates({ cart: cart(PASTA), ads: [], promotions: [] }));
  assert(r.items.every(i => i.placementType === "organic"));
  const unlisted = run(candidates({ cart: cart(PASTA), ads: [ad({ ...SAUCE, productId: "p-not-sold" })] }));
  assert(!unlisted.items.some(i => i.placementType === "sponsored"), "an ad for a product not sold here is ignored");
});
test("products in the cart and duplicates are never suggested; a promoted product in the cart is skipped", () => {
  const r = run(candidates({ cart: cart(PASTA, CROQ, BASIL), promotions: [promo(CROQ, 9), promo(MILK, 1, "pv-2")], ads: [ad()] }));
  const codes = r.items.map(i => i.product.code);
  assert.equal(new Set(codes).size, codes.length);
  assert(!codes.includes(PASTA.code) && !codes.includes(CROQ.code) && !codes.includes(BASIL.code));
  assert.equal(r.items.find(i => i.placementType === "store_promo")!.product.code, MILK.code);
});
test("higher store priority wins the single store slot; at most one store_promo and one sponsored", () => {
  const r = run(candidates({ cart: cart(PASTA), promotions: [promo(CROQ, 1, "pv-a"), promo(YOGURT, 7, "pv-b")], ads: [ad(), ad(BASIL, "pl-2")] }));
  assert.equal(r.items.filter(i => i.placementType === "store_promo").length, 1);
  assert.equal(r.items.filter(i => i.placementType === "sponsored").length, 1);
  assert.equal(r.items.find(i => i.placementType === "store_promo")!.product.code, YOGURT.code);
  assert.equal(r.items.length, 3);
});
test("history ON: replenishment for a due product; history OFF never uses history (replenishment)", () => {
  const due = [summary(MILK, 9, 7), summary(EGG, 2, 14), summary(YOGURT, 30, null, 1)];
  const r = run(candidates({ popular: [{ productId: TISSUE.productId, orders: 3 }] }), on, due);
  assert.deepEqual(shape(r), [[1, "organic", MILK.code, "replenishment"], [2, "organic", TISSUE.code, "popular"]],
    "eggs (2 of 14 days) and a one-off yogurt are not due");
  assert.equal(r.items.find(i => i.reasonCode === "replenishment")!.reasonText, "いつもの購入周期から、そろそろです");
  const hidden = run(candidates({ popular: [{ productId: TISSUE.productId, orders: 3 }] }), { usePurchaseHistory: false, useCurrentCart: true }, due);
  assert(!hidden.items.some(i => i.reasonCode === "replenishment"));
});
test("cart use OFF: no co_purchase and no sponsored (both need the cart), but cart items are still excluded", () => {
  const r = run(candidates({ cart: cart(PASTA), promotions: [promo()], ads: [ad()], popular: [{ productId: PASTA.productId, orders: 9 }, { productId: MILK.productId, orders: 5 }] }), off);
  assert.deepEqual(shape(r), [[1, "organic", MILK.code, "popular"], [2, "store_promo", CROQ.code, "store_pick"]]);
});
test("no candidates: an empty selection (nothing to save)", () => {
  assert.deepEqual(run(candidates(), off).items, []);
});
