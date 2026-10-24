import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { discountLabel, rankSerendipity } from "../src/features/offers/serendipity.ts";
import type { OfferList, StoreOffer } from "../src/features/offers/contracts.ts";
import type { AssociationRuleSet } from "../src/features/recommendations/association.ts";

const rules = JSON.parse(await readFile(new URL("../src/features/recommendations/association-rules.json", import.meta.url), "utf8")) as AssociationRuleSet;
const product = (code: string, name: string, price: number) => ({ productId: `p-${code}`, code, name, category: "検証", price, available: true });
const PASTA = product("2900000000100", "スパゲッティ 500g", 248), BASIL = product("2900000000179", "生バジル", 198);
const SAUCE = product("2900000000162", "トマトパスタソース", 298), KARAAGE = product("PLU-2002", "若鶏の唐揚げ 100g", 218);
const EGG = product("2900000000063", "新鮮たまご 10個", 298), ONION = product("PLU-1001", "玉ねぎ 1個", 78), CHIPS = product("2900000000117", "うすしおポテトチップス", 178);
const offer = (o: Partial<StoreOffer> & Pick<StoreOffer, "offerId" | "kind" | "product">): StoreOffer => ({
  headline: o.offerId, discountPercent: 25, discountAmount: null, unitDiscount: Math.floor(o.product.price / 4),
  startsAt: "2026-10-25T08:00:00Z", endsAt: "2026-10-25T09:00:00Z", trigger: null, productInCart: false, triggerInCart: false, ...o,
});
const list = (cart: string[], offers: StoreOffer[]): OfferList => ({ visitId: "v", cartVersion: 3, serverTime: "2026-10-25T08:30:00Z", nextChangeAt: null, offers, cartProductCodes: cart });

test("pasta in the cart: basil coupon (curated relation) with its reason; set deal proposes adding the sauce", () => {
  const r = rankSerendipity(list([PASTA.code], [
    offer({ offerId: "c1", kind: "guerrilla_coupon", product: BASIL, trigger: { ...PASTA, unitDiscount: 0 }, triggerInCart: true }),
    offer({ offerId: "s1", kind: "set_deal", product: SAUCE, trigger: { ...PASTA, unitDiscount: 24 }, triggerInCart: true, discountPercent: 10, unitDiscount: 29 }),
  ]), rules);
  assert.equal(r.coupon?.offerId, "c1"); assert.equal(r.coupon?.relation?.origin, "initial");
  assert.equal(r.coupon?.reason, "スパゲッティの仕上げに合います（KAGOが登録した組み合わせ）。25%OFFでお得なため選ばれました。");
  assert.equal(r.sets[0].action, "add"); assert.match(r.sets[0].reason, /スパゲッティとトマトパスタソース/);
  assert.equal(r.ruleVersion, 2);
});
test("coupons are not shown for products already in the cart or without trigger/relation", () => {
  const r = rankSerendipity(list([PASTA.code], [
    offer({ offerId: "in-cart", kind: "guerrilla_coupon", product: BASIL, productInCart: true }),
    offer({ offerId: "missing-trigger", kind: "guerrilla_coupon", product: SAUCE, trigger: { ...KARAAGE, unitDiscount: 0 } }),
    offer({ offerId: "unrelated", kind: "guerrilla_coupon", product: KARAAGE }),
    offer({ offerId: "set-without-trigger", kind: "set_deal", product: SAUCE, trigger: { ...KARAAGE, unitDiscount: 1 } }),
  ]), rules);
  assert.equal(r.coupon, null); assert.deepEqual(r.sets, []);
});
test("untriggered coupons use the analysis rules: a more specific (higher lift) pair and bigger discount wins", () => {
  // eggs → onions has a high lift in the public data; eggs → chips is not a rule at all.
  const r = rankSerendipity(list([EGG.code], [
    offer({ offerId: "onion", kind: "guerrilla_coupon", product: ONION, discountPercent: null, discountAmount: 20, unitDiscount: 20 }),
    offer({ offerId: "chips", kind: "guerrilla_coupon", product: CHIPS }),
  ]), rules);
  assert.equal(r.coupon?.offerId, "onion"); assert.equal(r.coupon?.relation?.origin, "analysis");
  assert.equal(r.coupon?.discountLabel, "20円引き");
});
test("time sales are always listed, ordered by end; 'apply' when the product is already in the cart", () => {
  const r = rankSerendipity(list([KARAAGE.code], [
    offer({ offerId: "late", kind: "time_sale", product: SAUCE, endsAt: "2026-10-25T10:00:00Z" }),
    offer({ offerId: "soon", kind: "time_sale", product: KARAAGE, productInCart: true }),
  ]), rules);
  assert.deepEqual(r.timeSales.map(o => [o.offerId, o.action]), [["soon", "apply"], ["late", "add"]]);
  assert.equal(discountLabel({ discountPercent: 20, discountAmount: null }), "20% OFF");
});
// DEMO-02 (#112/#116) replaced "a store-tied coupon always comes first": every coupon competes on
// Association × Novelty × Deal. Apple: pasta→pip fruit lift 1.945 × (1 + 50/158) beats basil 1.5 × 1.25.
test("a store-tied coupon no longer jumps the queue; the higher Association × Deal wins", () => {
  const r = rankSerendipity(list([PASTA.code], [
    offer({ offerId: "rule-only", kind: "guerrilla_coupon", product: product("PLU-1002", "国産りんご 1個", 158), discountPercent: null, discountAmount: 50, unitDiscount: 50 }),
    offer({ offerId: "store", kind: "guerrilla_coupon", product: BASIL, trigger: { ...PASTA, unitDiscount: 0 }, triggerInCart: true }),
  ]), rules);
  assert.equal(r.coupon?.offerId, "rule-only"); assert.equal(r.coupon?.targeting?.relation.source, "analysis");
});
