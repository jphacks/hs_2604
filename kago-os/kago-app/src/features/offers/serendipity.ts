// APP-13: choose which store offers to surface as "serendipity" (related × unexpected × good deal).
// Pure and deterministic; the DB decides validity/discounts, this only ranks what the DB returned.
// The guerrilla coupon is chosen per customer by DEMO-02 (targeting.ts, docs/specs/app-coupon-targeting.md).
import type { AssociationRuleSet } from "../recommendations/association";
import type { OfferList, SerendipityOffer, SerendipityResponse, StoreOffer } from "./contracts";
import { targetCoupon, type CouponHistory, type CouponDecision } from "./targeting.ts";
import { shortProductName } from "../../lib/product-name.ts";

const INITIAL_RELATION = 1.5; // curated pairs count as a moderate, explainable relation
const STORE_TRIGGER = 1.2;    // store said "show when X is in the cart" without a data rule

export function discountLabel(offer: Pick<StoreOffer, "discountPercent" | "discountAmount">) {
  return offer.discountPercent !== null ? `${offer.discountPercent}% OFF` : `${offer.discountAmount}円引き`;
}

/** Best rule from any cart product to the target (lift = how specific/unexpected the pair is). */
function relation(rules: AssociationRuleSet, cartCodes: Set<string>, target: string) {
  let best: { ruleId: string; origin: "initial" | "analysis"; triggeredBy: string; strength: number; reason: string } | null = null;
  for (const rule of [...rules.initialRules.map(r => ({ ...r, origin: "initial" as const })), ...rules.rules]) {
    if (rule.to !== target || !cartCodes.has(rule.from)) continue;
    const strength = rule.origin === "initial" ? INITIAL_RELATION : rule.lift ?? 1;
    if (!best || strength > best.strength || (strength === best.strength && rule.id < best.ruleId)) {
      best = { ruleId: rule.id, origin: rule.origin, triggeredBy: rule.from, strength, reason: rule.reason };
    }
  }
  return best;
}

/** Trigger t for coupon targeting: the last product put into the cart (all cart products before the 20261025 migration). */
export function couponTriggers(list: OfferList) {
  if (list.lastAddedProduct) return [{ code: list.lastAddedProduct.code, name: list.lastAddedProduct.name }];
  if (list.lastAddedProduct === null) return [];
  const names = new Map(list.offers.flatMap(offer => offer.trigger ? [[offer.trigger.code, offer.trigger.name] as const] : []));
  return list.cartProductCodes.map(code => ({ code, name: names.get(code) ?? "かごの商品" }));
}
export function decideCoupon(list: OfferList, rules: AssociationRuleSet, history: CouponHistory): CouponDecision {
  return targetCoupon({ offers: list.offers, triggers: couponTriggers(list), cartProductCodes: list.cartProductCodes,
    history, rules, claimedCouponCount: list.claimedCouponCount });
}

// history: what loadRecommendationInput allowed (DEMO-02). Without it, coupons are chosen without any history.
export function rankSerendipity(list: OfferList, rules: AssociationRuleSet, history: CouponHistory = { status: "disabled" }): SerendipityResponse {
  const sets: SerendipityOffer[] = []; const timeSales: SerendipityOffer[] = [];
  for (const offer of list.offers) {
    const rate = offer.unitDiscount / Math.max(1, offer.product.price);
    const base = { ...offer, discountLabel: discountLabel(offer) };
    if (offer.kind === "time_sale") {
      timeSales.push({ ...base, action: offer.productInCart ? "apply" : "add", score: rate, relation: null,
        reason: offer.productInCart ? "かごの商品がセール価格になります" : "いまだけの店内タイムセールです" });
    } else if (offer.kind === "set_deal") { // guerrilla coupons are chosen per customer below (DEMO-02)
      if (!offer.triggerInCart || !offer.trigger) continue;
      const related = relation(rules, new Set([offer.trigger.code]), offer.product.code);
      sets.push({ ...base, action: offer.productInCart ? "apply" : "add", score: (related?.strength ?? STORE_TRIGGER) * (1 + rate),
        relation: related ? { ruleId: related.ruleId, origin: related.origin, triggeredBy: related.triggeredBy }
          : { ruleId: `store-${offer.offerId}`, origin: "store", triggeredBy: offer.trigger.code },
        reason: `${shortProductName(offer.trigger.name)}と${shortProductName(offer.product.name)}を一緒に買うとお得です` });
    }
  }
  const order = (a: SerendipityOffer, b: SerendipityOffer) => b.score - a.score || a.offerId.localeCompare(b.offerId);
  return {
    visitId: list.visitId, cartVersion: list.cartVersion, serverTime: list.serverTime, nextChangeAt: list.nextChangeAt,
    ruleVersion: rules.version,
    timeSales: timeSales.sort((a, b) => a.endsAt.localeCompare(b.endsAt) || order(a, b)),
    // One sticker at a time keeps it a surprise: the best Association × Novelty × Deal for this customer.
    coupon: toCoupon(list, decideCoupon(list, rules, history)),
    sets: sets.sort(order).slice(0, 2),
  };
}

function toCoupon(list: OfferList, decision: CouponDecision): SerendipityOffer | null {
  const chosen = decision.selected;
  const offer = chosen && list.offers.find(item => item.offerId === chosen.offerId);
  if (!chosen || !offer) return null;
  return { ...offer, discountLabel: discountLabel(offer), action: "add", score: chosen.score, reason: chosen.reason,
    relation: { ruleId: chosen.relation.ruleId, origin: chosen.relation.source, triggeredBy: chosen.trigger.code }, targeting: chosen };
}
