import type { createHeadlessBackend } from "@kago/backend";
import { loadRecommendationInput } from "./input.ts";
import { isReplenishmentDue, regularReminders, type RegularReminder } from "./purchase-cycle.ts";
import type { SelectionCandidates } from "./selection-contracts.ts";

type Client = ReturnType<typeof createHeadlessBackend>;
export type RegularReminderResponse = { visitId: string; status: "disabled" | "ready"; items: RegularReminder[] };

/**
 * #152: regular purchases that are due, for the reminder card. History comes only through APP-03's
 * loadRecommendationInput, so nothing is read when the customer turned history use off.
 * The store's current listings (read-only app_selection_candidates) decide price and availability.
 */
export async function loadRegularReminders(client: Client, selectedVisit: unknown): Promise<RegularReminderResponse> {
  const input = await loadRecommendationInput(client, selectedVisit);
  const visitId = input.scope.visitId;
  if (input.history.status === "disabled") return { visitId, status: "disabled", items: [] };
  if (!input.history.summaries.some(isReplenishmentDue)) return { visitId, status: "ready", items: [] };
  const { data, error } = await client.rpc("app_selection_candidates", { p_visit_id: visitId });
  if (error) throw error;
  const candidates = data as SelectionCandidates;
  return { visitId, status: "ready",
    items: regularReminders(input.history.summaries, candidates.listings, candidates.cart.map(item => item.productId)) };
}
