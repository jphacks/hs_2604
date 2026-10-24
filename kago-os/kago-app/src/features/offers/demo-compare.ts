// DEMO-07 (#118): what each demo customer would receive if the same product (t) were put into the cart.
// Pure: it only rewrites the cart-dependent flags of the DB's offer list for a hypothetical cart [t]
// and hands everything to the same targetCoupon() the App uses (DEMO-02). Nothing is written to the DB.
import type { AssociationRuleSet } from "../recommendations/association";
import type { StoreOffer } from "./contracts";
import { isRegularPurchase, targetCoupon, type CouponDecision, type CouponHistory, type ExclusionReason, type TriggerProduct } from "./targeting.ts";

export const DEMO_TRIGGER_CODE = "2900000000100"; // スパゲッティ 500g (#112)

export const exclusionLabels: Record<ExclusionReason, string> = {
  not_coupon: "クーポンではない", in_cart: "かごに入っている", dismissed: "見送り済み", trigger_missing: "きっかけ商品が違う",
  no_relation: "関連がない", regular_purchase: "定期購入品", visit_limit: "受け取り上限",
};

/** The DB list as if the cart held only t: flags that depend on the real cart are recomputed, nothing else. */
export function offersForHypotheticalCart(offers: StoreOffer[], triggerCode: string): StoreOffer[] {
  return offers.map(offer => ({ ...offer, productInCart: offer.product.code === triggerCode,
    triggerInCart: offer.trigger?.code === triggerCode, dismissed: false }));
}

export function compareCoupon(input: { offers: StoreOffer[]; trigger: TriggerProduct; history: CouponHistory; rules: AssociationRuleSet }): CouponDecision {
  return targetCoupon({ offers: offersForHypotheticalCart(input.offers, input.trigger.code), triggers: [input.trigger],
    cartProductCodes: [input.trigger.code], history: input.history, rules: input.rules });
}

/** Products this customer buys regularly (only from history they allowed us to use). */
export function regularProductIds(history: CouponHistory): string[] {
  return history.status === "available" ? history.summaries.filter(isRegularPurchase).map(summary => summary.productId) : [];
}
