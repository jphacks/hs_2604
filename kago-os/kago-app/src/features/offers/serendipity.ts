// APP-13: choose which store offers to surface as "serendipity" (related × unexpected × good deal).
// Pure and deterministic; the DB decides validity/discounts, this only ranks what the DB returned.
import type { AssociationRuleSet } from "../recommendations/association";
import type { OfferList, SerendipityOffer, SerendipityResponse, StoreOffer } from "./contracts";

const INITIAL_RELATION = 1.5; // curated pairs count as a moderate, explainable relation
const STORE_TRIGGER = 1.2;    // store said "show when X is in the cart" without a data rule

export function discountLabel(offer: Pick<StoreOffer, "discountPercent" | "discountAmount">) {
  return offer.discountPercent !== null ? `${offer.discountPercent}% OFF` : `${offer.discountAmount}円引き`;
}
const shortName = (name: string) => name.replace(/\s.*$/, "");

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

export function rankSerendipity(list: OfferList, rules: AssociationRuleSet): SerendipityResponse {
  const cart = new Set(list.cartProductCodes);
  const coupons: SerendipityOffer[] = []; const sets: SerendipityOffer[] = []; const timeSales: SerendipityOffer[] = [];
  for (const offer of list.offers) {
    const rate = offer.unitDiscount / Math.max(1, offer.product.price);
    const base = { ...offer, discountLabel: discountLabel(offer) };
    if (offer.kind === "time_sale") {
      timeSales.push({ ...base, action: offer.productInCart ? "apply" : "add", score: rate, relation: null,
        reason: offer.productInCart ? "かごの商品がセール価格になります" : "いまだけの店内タイムセールです" });
    } else if (offer.kind === "guerrilla_coupon") {
      // Never suggest what the customer already picked; a coupon is a discovery, not a discount on the plan.
      if (offer.productInCart) continue;
      if (offer.trigger && !offer.triggerInCart) continue;
      const related = relation(rules, cart, offer.product.code);
      if (!offer.trigger && !related) continue; // untriggered coupons need a data/curated relation to the cart
      const strength = related?.strength ?? STORE_TRIGGER;
      coupons.push({ ...base, action: "add", score: strength * (1 + rate),
        relation: related ? { ruleId: related.ruleId, origin: related.origin, triggeredBy: related.triggeredBy }
          : { ruleId: `store-${offer.offerId}`, origin: "store", triggeredBy: offer.trigger!.code },
        reason: related ? related.reason : `${shortName(offer.trigger!.name)}を選んだ方へのお得情報です` });
    } else {
      if (!offer.triggerInCart || !offer.trigger) continue;
      const related = relation(rules, new Set([offer.trigger.code]), offer.product.code);
      sets.push({ ...base, action: offer.productInCart ? "apply" : "add", score: (related?.strength ?? STORE_TRIGGER) * (1 + rate),
        relation: related ? { ruleId: related.ruleId, origin: related.origin, triggeredBy: related.triggeredBy }
          : { ruleId: `store-${offer.offerId}`, origin: "store", triggeredBy: offer.trigger.code },
        reason: `${shortName(offer.trigger.name)}と${shortName(offer.product.name)}を一緒に買うとお得です` });
    }
  }
  const order = (a: SerendipityOffer, b: SerendipityOffer) => b.score - a.score || a.offerId.localeCompare(b.offerId);
  return {
    visitId: list.visitId, cartVersion: list.cartVersion, serverTime: list.serverTime, nextChangeAt: list.nextChangeAt,
    ruleVersion: rules.version,
    timeSales: timeSales.sort((a, b) => a.endsAt.localeCompare(b.endsAt) || order(a, b)),
    // One sticker at a time keeps it a surprise. A coupon the store tied to a product in the cart
    // (explicit intent) comes before one surfaced only by a data/curated relation.
    coupon: coupons.sort((a, b) => Number(!!b.trigger) - Number(!!a.trigger) || order(a, b))[0] ?? null,
    sets: sets.sort(order).slice(0, 2),
  };
}
