import { createHash } from "node:crypto";
import type { createHeadlessBackend } from "@kago/backend";
import { AccountError } from "../account/service.ts";
import { loadRecommendationInput } from "./input.ts";
import { selectRecommendations } from "./selection.ts";
import type { AssociationRuleSet } from "./association.ts";
import type { SavedSelection, Selection, SelectionCandidates } from "./selection-contracts.ts";

type Client = ReturnType<typeof createHeadlessBackend>;

// Same visit + cart version + rule version + chosen slots => same selection id, so reloading the
// screen re-sends a no-op instead of storing duplicate selections (DB-05 accepts identical resends).
export function selectionId(selection: Selection) {
  const key = JSON.stringify([selection.visitId, selection.cartVersion, selection.ruleVersion, selection.items.map(i =>
    [i.slot, i.placementType, i.product.productId, i.adPlacementId, i.promotionVersionId, i.reasonCode, i.reasonText])]);
  const h = createHash("sha256").update(key).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * APP-05 server entry: read the visit's inputs (APP-03 settings/history, DB candidates), choose the
 * slots in the App and store them with kago_save_selection. Nothing is taken from the browser.
 */
export async function selectAndSave(client: Client, selectedVisit: unknown, rules: AssociationRuleSet): Promise<SavedSelection> {
  const input = await loadRecommendationInput(client, selectedVisit);
  const { data, error } = await client.rpc("app_selection_candidates", { p_visit_id: input.scope.visitId });
  if (error) throw error;
  const candidates = data as SelectionCandidates;
  if (candidates.visit.cart_version !== input.scope.cartVersion) throw new AccountError("input_changed", 409);
  const selection = selectRecommendations({ candidates, settings: input.settings, summaries: input.history.summaries }, rules);
  if (!selection.items.length) return { ...selection, selectionId: null, items: [] };
  const id = selectionId(selection);
  const saved = await client.rpc("kago_save_selection", {
    p_visit_id: selection.visitId, p_cart_version: selection.cartVersion, p_rule_version: selection.ruleVersion,
    p_selection_id: id,
    p_items: selection.items.map(i => ({ slot: i.slot, rank: i.rank, placement_type: i.placementType, product_id: i.product.productId,
      ad_placement_id: i.adPlacementId, promotion_version_id: i.promotionVersionId, reason_code: i.reasonCode, reason_text: i.reasonText })),
  });
  // A cart change between reading and saving makes the DB-05 trigger reject the stale selection.
  if (saved.error) throw ["23514", "40001"].includes(saved.error.code ?? "") ? new AccountError("input_changed", 409) : saved.error;
  // An identical earlier selection (same id) is accepted as a resend even if the cart moved on since:
  // re-check the version so a stale result is never returned as current (APP-08 then reloads).
  const current = await client.from("visits").select("cart_version").eq("id", selection.visitId).maybeSingle();
  if (current.error) throw current.error;
  if (current.data?.cart_version !== selection.cartVersion) throw new AccountError("input_changed", 409);
  const rows = await client.from("selection_items").select("id,slot,product_id").eq("selection_id", id);
  if (rows.error) throw rows.error;
  const bySlot = new Map((rows.data ?? []).map(r => [r.slot as number, r]));
  return { ...selection, selectionId: id, items: selection.items.map(item => {
    const row = bySlot.get(item.slot);
    if (!row || row.product_id !== item.product.productId) throw new AccountError("input_changed", 409);
    return { ...item, selectionItemId: row.id as string };
  }) };
}
