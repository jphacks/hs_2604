// APP-05: choose and rank suggestion slots. Pure and deterministic: the same candidates, settings,
// history summaries and rule version always give the same slots. The DB re-validates on save.
//
// Rules (common spec §7): at most 3 slots, at most 1 store_promo and 1 sponsored, the rest organic;
// never a product in the cart, never the same product twice; the type and the reason always agree.
import { relatedProducts, type AssociationRuleSet } from "./association.ts";
import type { ProductPurchaseSummary } from "./customer.ts";
import type { Listing, ReasonCode, Selection, SelectionCandidates, SelectionItem } from "./selection-contracts.ts";
import { shortProductName } from "../../lib/product-name.ts";

export const MAX_SLOTS = 3;
export const REPLENISH_RATIO = 0.8; // "due" when 80% of the usual interval has passed
const INITIAL_STRENGTH = 1.5;

export type SelectionInput = {
  candidates: SelectionCandidates;
  // APP-03 settings: history feeds replenishment; the cart feeds relevance (co_purchase / sponsored).
  settings: { usePurchaseHistory: boolean; useCurrentCart: boolean };
  summaries: ProductPurchaseSummary[];
};
type Draft = Omit<SelectionItem, "slot" | "rank">;

function strongestRelation(rules: AssociationRuleSet, cartCodes: Set<string>, target: string) {
  let best: { ruleId: string; origin: "initial" | "analysis"; from: string; strength: number } | null = null;
  for (const rule of [...rules.initialRules.map(r => ({ ...r, origin: "initial" as const })), ...rules.rules]) {
    if (rule.to !== target || !cartCodes.has(rule.from)) continue;
    const strength = rule.origin === "initial" ? INITIAL_STRENGTH : rule.lift ?? 1;
    if (!best || strength > best.strength || (strength === best.strength && rule.id < best.ruleId)) {
      best = { ruleId: rule.id, origin: rule.origin, from: rule.from, strength };
    }
  }
  return best;
}

export function selectRecommendations(input: SelectionInput, rules: AssociationRuleSet): Selection {
  const { candidates, settings } = input;
  const byId = new Map(candidates.listings.map(l => [l.productId, l]));
  const byCode = new Map(candidates.listings.map(l => [l.code, l]));
  const inCart = new Set(candidates.cart.map(c => c.productId));
  const cartCodes = new Set(settings.useCurrentCart ? candidates.cart.map(c => c.code) : []);
  const used = new Set<string>(inCart);
  const available = (productId: string) => byId.has(productId) && !used.has(productId);
  const organic = (product: Listing, reasonCode: ReasonCode, reasonText: string, evidence: Draft["evidence"]): Draft =>
    ({ placementType: "organic", reasonCode, reasonText, product, adPlacementId: null, promotionVersionId: null, sponsor: null, evidence });

  // 1. Store promotion: store intent, chosen by its priority (then relevance to the cart, then id).
  let promo: Draft | null = null;
  const promos = candidates.promotions.filter(p => available(p.productId)).map(p => ({
    p, strength: strongestRelation(rules, cartCodes, byId.get(p.productId)!.code)?.strength ?? 0 }))
    .sort((a, b) => b.p.priority - a.p.priority || b.strength - a.strength || a.p.promotionVersionId.localeCompare(b.p.promotionVersionId));
  if (promos[0]) {
    const { p } = promos[0];
    promo = { placementType: "store_promo", reasonCode: "store_pick", reasonText: p.reasonText, product: byId.get(p.productId)!,
      adPlacementId: null, promotionVersionId: p.promotionVersionId, sponsor: null, evidence: { promotionPriority: p.priority } };
    used.add(p.productId);
  }

  // 2. Sponsored: only an approved, deliverable ad related to what is in the cart (sponsored_related).
  let sponsored: Draft | null = null;
  const ads = candidates.ads.filter(a => available(a.productId)).map(a => ({ a, rel: strongestRelation(rules, cartCodes, byId.get(a.productId)!.code) }))
    .filter(x => x.rel).sort((x, y) => y.rel!.strength - x.rel!.strength || x.a.adPlacementId.localeCompare(y.a.adPlacementId));
  if (ads[0]) {
    const { a, rel } = ads[0];
    const trigger = byCode.get(rel!.from);
    sponsored = { placementType: "sponsored", reasonCode: "sponsored_related",
      reasonText: `${shortProductName(trigger?.name ?? "かごの商品")}を選んだ方への広告です`, product: byId.get(a.productId)!,
      adPlacementId: a.adPlacementId, promotionVersionId: null,
      sponsor: { makerName: a.makerName, headline: a.headline, creativeVersionId: a.creativeVersionId },
      evidence: { ruleId: rel!.ruleId, ruleOrigin: rel!.origin, triggeredBy: rel!.from } };
    used.add(a.productId);
  }

  // 3. Organic: co_purchase (cart), replenishment (history), popular (store) — taken in turns.
  const coPurchase: Draft[] = relatedProducts(rules, cartCodes, { rankBy: "confidence", limit: 20 })
    .filter(c => byCode.has(c.code)).map(c => organic(byCode.get(c.code)!, "co_purchase", c.reason,
      { ruleId: c.ruleId, ruleOrigin: c.origin, triggeredBy: c.triggeredBy }));
  const replenishment: Draft[] = !settings.usePurchaseHistory ? [] : input.summaries
    .filter(s => s.purchaseCount >= 2 && s.averageIntervalDays && s.daysSinceLastPurchase / s.averageIntervalDays >= REPLENISH_RATIO && byId.has(s.productId))
    .map(s => ({ s, ratio: s.daysSinceLastPurchase / s.averageIntervalDays! }))
    .sort((a, b) => b.ratio - a.ratio || a.s.productId.localeCompare(b.s.productId))
    .map(({ s, ratio }) => organic(byId.get(s.productId)!, "replenishment", "いつもの購入周期から、そろそろです", { cycleRatio: Number(ratio.toFixed(2)) }));
  const popular: Draft[] = candidates.popular.filter(p => byId.has(p.productId))
    .map(p => organic(byId.get(p.productId)!, "popular", "売れ筋の商品です", { orders: p.orders }));
  const organicSlots = MAX_SLOTS - Number(!!promo) - Number(!!sponsored);
  const organics: Draft[] = [];
  const queues = [coPurchase, replenishment, popular];
  for (let round = 0; organics.length < organicSlots && queues.some(q => q.length); round++) {
    for (const queue of queues) {
      while (queue.length && !available(queue[0].product.productId)) queue.shift();
      const next = queue.shift();
      if (next && organics.length < organicSlots) { organics.push(next); used.add(next.product.productId); }
    }
  }

  // Display order: best organic, store pick, sponsored, then the remaining organic slots.
  const ordered = [organics[0], promo, sponsored, ...organics.slice(1)].filter((d): d is Draft => !!d).slice(0, MAX_SLOTS);
  return {
    visitId: candidates.visit.id, cartVersion: candidates.visit.cart_version, ruleVersion: rules.version,
    items: ordered.map((d, i) => ({ ...d, slot: i + 1, rank: i + 1 })),
  };
}
