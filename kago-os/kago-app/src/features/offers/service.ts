import { getBackendIdentity, type createHeadlessBackend } from "@kago/backend";
import { isUuid } from "../shopping/service.ts";
import { CartError } from "../cart/service.ts";
import { AccountError } from "../account/service.ts";
import type { AssociationRuleSet } from "../recommendations/association.ts";
import { loadRecommendationInput } from "../recommendations/input.ts";
import { rankSerendipity } from "./serendipity.ts";
import type { CouponHistory } from "./targeting.ts";
import type { OfferEventType, OfferList, SerendipityResponse } from "./contracts.ts";

type Client = ReturnType<typeof createHeadlessBackend>;

// DEMO-02: the customer's history for coupon targeting, always through APP-03's loadRecommendationInput.
// When history use is OFF nothing is read from the history (status "disabled" only).
export async function loadCouponHistory(client: Client, visitId: string): Promise<CouponHistory> {
  let input: Awaited<ReturnType<typeof loadRecommendationInput>> | undefined;
  for (let attempt = 0; attempt < 2 && !input; attempt++) {
    try { input = await loadRecommendationInput(client, visitId); }
    catch (error) {
      if (error instanceof AccountError && error.code === "input_changed" && attempt === 0) continue;
      if (error instanceof AccountError && error.code === "visit_unavailable") throw new CartError("visit_ended", 409);
      if (error instanceof AccountError && error.code === "input_changed") throw new CartError("cart_changed", 409);
      throw error;
    }
  }
  if (!input || input.history.status === "disabled") return { status: "disabled" };
  if (input.history.status === "empty" || input.history.summaries.length === 0) return { status: "empty" };
  const ids = input.history.summaries.map(summary => summary.productId);
  // Categories of purchased products, for "same category, not yet bought" (customers can read the product master).
  const { data, error } = await client.from("products").select("id,category").in("id", ids);
  if (error) throw error;
  const wanted = new Set(ids);
  const categories = Object.fromEntries((data ?? []).filter(row => wanted.has(row.id)).map(row => [row.id, row.category]));
  return { status: "available", summaries: input.history.summaries, categories };
}

export async function loadSerendipityOffers(client: Client, visitId: unknown, rules: AssociationRuleSet): Promise<SerendipityResponse> {
  await getBackendIdentity(client, "customer");
  if (!isUuid(visitId)) throw new CartError("visit_ended", 409);
  const { data, error } = await client.rpc("app_list_offers", { p_visit_id: visitId });
  if (error) throw error;
  const list = data as OfferList;
  const needsHistory = list.offers.some(offer => offer.kind === "guerrilla_coupon");
  return rankSerendipity(list, rules, needsHistory ? await loadCouponHistory(client, visitId) : { status: "disabled" });
}
export async function recordOfferEvent(client: Client, visitId: unknown, input: Record<string, unknown>) {
  await getBackendIdentity(client, "customer");
  if (!isUuid(visitId) || !isUuid(input.eventId) || !isUuid(input.offerId)
    || !["offer_shown", "offer_opened", "offer_dismissed"].includes(String(input.type))) throw new CartError("invalid_request");
  const { error } = await client.rpc("app_record_offer_event", {
    p_visit_id: visitId, p_event_id: input.eventId, p_offer_id: input.offerId, p_event_type: input.type as OfferEventType,
  });
  if (error) throw error;
  return { recorded: true };
}
