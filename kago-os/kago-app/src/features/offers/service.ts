import { getBackendIdentity, type createHeadlessBackend } from "@kago/backend";
import { isUuid } from "../shopping/service.ts";
import { CartError } from "../cart/service.ts";
import type { AssociationRuleSet } from "../recommendations/association.ts";
import { rankSerendipity } from "./serendipity.ts";
import type { OfferEventType, OfferList, SerendipityResponse } from "./contracts.ts";

type Client = ReturnType<typeof createHeadlessBackend>;
export async function loadSerendipityOffers(client: Client, visitId: unknown, rules: AssociationRuleSet): Promise<SerendipityResponse> {
  await getBackendIdentity(client, "customer");
  if (!isUuid(visitId)) throw new CartError("visit_ended", 409);
  const { data, error } = await client.rpc("app_list_offers", { p_visit_id: visitId });
  if (error) throw error;
  return rankSerendipity(data as OfferList, rules);
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
