// DEMO-02 (#116): choose at most one guerrilla coupon per customer (spec: docs/specs/app-coupon-targeting.md).
//   Score(u, t, p) = Association(t, p) × Novelty(u, p) × Deal(p)
// Pure and deterministic: no DB access, no clock, no randomness. The DB has already removed offers that are
// stopped, outside their period, for another store, for an inactive product, or already claimed in this visit;
// the discount amount is always computed by the DB. Only real purchase history is used — never age, gender,
// household or any other inferred attribute — and none of it when the customer turned history use off.
import type { AssociationRule, AssociationRuleSet } from "../recommendations/association";
import type { ProductPurchaseSummary } from "../recommendations/customer";
import type { StoreOffer } from "./contracts";
import { shortProductName } from "../../lib/product-name.ts";
import { isRegularPurchase } from "../recommendations/purchase-cycle.ts";

// The regular-purchase definition is shared with the replenishment slot and the reminder card (#152).
export { isRegularPurchase, REGULAR_INTERVAL_FACTOR, REGULAR_MIN_PURCHASES } from "../recommendations/purchase-cycle.ts";

export const INITIAL_ASSOCIATION = 1.5;      // curated (initialRules) pair without enough public data
export const STORE_TRIGGER_ASSOCIATION = 1.2; // the store tied the coupon to t, without a data/curated rule
export const NOVELTY = {
  regular_purchase: 0, purchased_before: 0.6, same_category: 1.3, never_purchased: 1, history_disabled: 1, history_empty: 1,
} as const;
export const MAX_COUPONS_PER_VISIT = 3;
const SCORE_DIGITS = 1e6; // scores are compared after rounding, so float noise never decides a tie

export type NoveltyReason = keyof typeof NOVELTY;
export type RelationSource = "analysis" | "initial" | "store";
// Only what the customer allowed: no history at all when it is disabled.
export type CouponHistory =
  | { status: "disabled" }
  | { status: "empty" }
  | { status: "available"; summaries: ProductPurchaseSummary[]; categories: Record<string, string> };
export type TriggerProduct = { code: string; name: string };
export type CouponTargetingInput = {
  offers: StoreOffer[];
  // t: the product that most recently entered the cart. Several only as a fallback before the
  // 20261025 migration (then every cart product is tried and the strongest relation is used).
  triggers: TriggerProduct[];
  cartProductCodes: string[];
  history: CouponHistory;
  rules: AssociationRuleSet;
  dismissedOfferIds?: Iterable<string>;     // "今回は見送る" in this visit
  claimedCouponCount?: number;              // coupons received in this visit
};
export type CouponScore = {
  offerId: string; productId: string; productCode: string; productName: string;
  trigger: TriggerProduct;
  score: number;
  breakdown: { association: number; novelty: number; deal: number };
  relation: { source: RelationSource; ruleId: string; lift: number | null; confidence: number | null };
  discountPercent: number;
  noveltyReason: NoveltyReason;
  reason: string;
};
export type ExclusionReason = "not_coupon" | "in_cart" | "dismissed" | "trigger_missing" | "no_relation" | "regular_purchase" | "visit_limit";
export type CouponDecision = {
  selected: CouponScore | null;
  candidates: CouponScore[];                // scored and ordered, best first
  excluded: { offerId: string; productCode: string; reason: ExclusionReason }[];
  historyStatus: CouponHistory["status"];
};

const round = (value: number) => Math.round(value * SCORE_DIGITS) / SCORE_DIGITS;

export function novelty(history: CouponHistory, product: Pick<StoreOffer["product"], "productId" | "category">): NoveltyReason {
  if (history.status === "disabled") return "history_disabled";
  if (history.status === "empty" || history.summaries.length === 0) return "history_empty";
  const own = history.summaries.find(summary => summary.productId === product.productId);
  if (own) return isRegularPurchase(own) ? "regular_purchase" : "purchased_before";
  const sameCategory = history.summaries.some(summary => summary.productId !== product.productId
    && history.categories[summary.productId] !== undefined && history.categories[summary.productId] === product.category);
  return sameCategory ? "same_category" : "never_purchased";
}

/** The store's discount as a rate: discountPercent, or the DB-computed amount relative to the price. */
export function dealRate(offer: Pick<StoreOffer, "discountPercent" | "unitDiscount" | "product">) {
  if (offer.discountPercent !== null) return offer.discountPercent;
  return round(offer.unitDiscount / Math.max(1, offer.product.price) * 100);
}

/** Association(t, p): public-data lift first, then a curated pair, then the store's own trigger. */
export function association(rules: AssociationRuleSet, from: string, offer: Pick<StoreOffer, "offerId" | "product" | "trigger">) {
  const pick = (list: AssociationRule[]) => list.filter(rule => rule.from === from && rule.to === offer.product.code)
    .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0) || a.id.localeCompare(b.id))[0];
  const analysis = pick(rules.rules.filter(rule => rule.origin === "analysis" && typeof rule.lift === "number"));
  if (analysis) return { value: analysis.lift!, relation: { source: "analysis" as const, ruleId: analysis.id, lift: analysis.lift!, confidence: analysis.confidence ?? null }, rule: analysis };
  const initial = pick(rules.initialRules);
  if (initial) return { value: INITIAL_ASSOCIATION, relation: { source: "initial" as const, ruleId: initial.id, lift: null, confidence: null }, rule: initial };
  if (offer.trigger?.code === from) return { value: STORE_TRIGGER_ASSOCIATION, relation: { source: "store" as const, ruleId: `store-${offer.offerId}`, lift: null, confidence: null }, rule: null };
  return null;
}

function reasonText(trigger: TriggerProduct, source: RelationSource, rule: AssociationRule | null, noveltyReason: NoveltyReason,
  discount: string, regularExcluded: boolean) {
  const t = shortProductName(trigger.name);
  const relation = source === "analysis" ? `公開購買データ（Groceries）では${t}と一緒に買われやすい組み合わせです。`
    : source === "initial" ? `${rule?.reason ?? `${t}と相性のよい商品です`}（KAGOが登録した組み合わせ）。`
      : `店舗が${t}と一緒に案内しているクーポンです。`;
  // History sentences are only produced from history the customer allowed us to use.
  const history = noveltyReason === "purchased_before" ? "以前購入したことがあり、定期的には購入していない商品です。"
    : noveltyReason === "same_category" ? "購入したことのある売場の、まだ購入したことのない商品です。"
      : noveltyReason === "never_purchased" ? "まだ購入したことのない商品です。" : "";
  const regular = regularExcluded ? "定期的に購入している商品は候補から外しています。" : "";
  return `${relation}${history}${discount}でお得なため選ばれました。${regular}`;
}

const discountText = (offer: StoreOffer) => offer.discountPercent !== null ? `${offer.discountPercent}%OFF` : `${offer.discountAmount}円引き`;

export function targetCoupon(input: CouponTargetingInput): CouponDecision {
  const cart = new Set(input.cartProductCodes);
  const dismissed = new Set(input.dismissedOfferIds ?? []);
  const excluded: CouponDecision["excluded"] = [];
  const scored: (CouponScore & { rule: AssociationRule | null })[] = [];
  const exclude = (offer: StoreOffer, reason: ExclusionReason) => excluded.push({ offerId: offer.offerId, productCode: offer.product.code, reason });
  for (const offer of input.offers) {
    if (offer.kind !== "guerrilla_coupon") continue;
    if (offer.productInCart || cart.has(offer.product.code)) { exclude(offer, "in_cart"); continue; }
    if (offer.dismissed || dismissed.has(offer.offerId)) { exclude(offer, "dismissed"); continue; }
    if (offer.trigger && !offer.triggerInCart) { exclude(offer, "trigger_missing"); continue; }
    let related: (NonNullable<ReturnType<typeof association>> & { trigger: TriggerProduct }) | null = null;
    for (const trigger of [...input.triggers].sort((a, b) => a.code.localeCompare(b.code))) {
      const found = association(input.rules, trigger.code, offer);
      if (found && (!related || found.value > related.value)) related = { ...found, trigger };
    }
    if (!related) { exclude(offer, "no_relation"); continue; }
    const noveltyReason = novelty(input.history, offer.product);
    if (noveltyReason === "regular_purchase") { exclude(offer, "regular_purchase"); continue; }
    const percent = dealRate(offer);
    const breakdown = { association: related.value, novelty: NOVELTY[noveltyReason], deal: round(1 + percent / 100) };
    scored.push({ offerId: offer.offerId, productId: offer.product.productId, productCode: offer.product.code, productName: offer.product.name,
      trigger: related.trigger, score: round(breakdown.association * breakdown.novelty * breakdown.deal), breakdown,
      relation: related.relation, discountPercent: percent, noveltyReason, reason: "", rule: related.rule });
  }
  const regularExcluded = excluded.some(item => item.reason === "regular_purchase");
  const candidates: CouponScore[] = scored
    .sort((a, b) => b.score - a.score || a.productCode.localeCompare(b.productCode) || a.offerId.localeCompare(b.offerId))
    .map(({ rule, ...item }) => ({ ...item,
      reason: reasonText(item.trigger, item.relation.source, rule, item.noveltyReason,
        discountText(input.offers.find(offer => offer.offerId === item.offerId)!), regularExcluded) }));
  const limited = (input.claimedCouponCount ?? 0) >= MAX_COUPONS_PER_VISIT;
  if (limited) for (const item of candidates) excluded.push({ offerId: item.offerId, productCode: item.productCode, reason: "visit_limit" });
  return { selected: limited ? null : candidates[0] ?? null, candidates: limited ? [] : candidates, excluded, historyStatus: input.history.status };
}
