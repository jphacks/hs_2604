import { getBackendIdentity, type createHeadlessBackend } from "@kago/backend";
import { CartError } from "../cart/service.ts";
import { isUuid } from "../shopping/service.ts";

type Client = ReturnType<typeof createHeadlessBackend>;
export async function recordAppEvent(client: Client, input: Record<string, unknown>) {
  const { userId } = await getBackendIdentity(client, "customer");
  if (input.user_id !== userId) throw new CartError("forbidden", 403);
  const payload = input.payload as Record<string, unknown> | null;
  if (!isUuid(input.event_id) || !isUuid(input.visit_id) || !isUuid(input.store_id)
    || input.schema_version !== 1 || input.channel !== "app" || input.data_origin !== "operated"
    || typeof input.occurred_at !== "string" || input.occurred_at.length > 40
    || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.occurred_at) || !Number.isFinite(Date.parse(input.occurred_at))
    || !payload || typeof payload !== "object" || Array.isArray(payload)) throw new CartError("invalid_request");
  let safePayload: object;
  if (input.event_type === "recommendation_impression" || input.event_type === "recommendation_click" || input.event_type === "recommendation_dismissed") {
    if (!isUuid(input.selection_item_id) || !isUuid(input.product_id)) throw new CartError("invalid_request");
    if (input.event_type === "recommendation_impression") {
      if (!Number.isSafeInteger(payload.visible_ms) || (payload.visible_ms as number) < 1000 || (payload.visible_ms as number) > 999_999_999) throw new CartError("invalid_request");
      safePayload = { visible_ms: payload.visible_ms };
    } else if (input.event_type === "recommendation_dismissed") {
      safePayload = {};
    } else {
      if (payload.target !== "detail" && payload.target !== "add_button") throw new CartError("invalid_request");
      safePayload = { target: payload.target };
    }
  } else if (input.event_type === "product_compared") {
    const ids = payload.product_ids;
    if (input.selection_item_id !== null || input.product_id !== null || !Array.isArray(ids)
      || ids.length < 2 || ids.length > 20 || !ids.every(isUuid) || new Set(ids).size !== ids.length) throw new CartError("invalid_request");
    safePayload = { product_ids: ids };
  } else if (["removal_reason_prompted","removal_reason_skipped","removal_reason_submitted"].includes(String(input.event_type))) {
    if (input.selection_item_id !== null || !isUuid(input.product_id) || !isUuid(payload.removal_event_id)) throw new CartError("invalid_request");
    if (input.event_type === "removal_reason_submitted") {
      if (typeof payload.reason !== "string" || !["価格が合わない","買う予定が変わった","別の商品にする","その他"].includes(payload.reason)) throw new CartError("invalid_request");
      safePayload = { removal_event_id: payload.removal_event_id, reason: payload.reason };
    } else safePayload = { removal_event_id: payload.removal_event_id };
  } else throw new CartError("invalid_request");

  // Check ownership even on the trigger's duplicate/no-op path. Ended own visits accept delayed delivery.
  const visit = await client.from("visits").select("id,store_id").eq("id", input.visit_id).eq("user_id", userId).maybeSingle();
  if (visit.error) throw visit.error;
  if (!visit.data || visit.data.store_id !== input.store_id) throw new CartError("forbidden", 403);
  if (input.selection_item_id !== null) {
    const item = await client.from("selection_items").select("id,product_id,selection_id").eq("id", input.selection_item_id).maybeSingle();
    if (item.error) throw item.error;
    if (!item.data || item.data.product_id !== input.product_id) throw new CartError("invalid_request");
    const selection = await client.from("selections").select("visit_id").eq("id", item.data.selection_id).maybeSingle();
    if (selection.error) throw selection.error;
    if (!selection.data || selection.data.visit_id !== input.visit_id) throw new CartError("invalid_request");
  }
  if (["removal_reason_prompted","removal_reason_skipped","removal_reason_submitted"].includes(String(input.event_type))) {
    const removal = await client.from("events").select("event_type,visit_id,product_id").eq("event_id",payload.removal_event_id).maybeSingle();
    if (removal.error) throw removal.error;
    if (!removal.data || removal.data.event_type !== "cart_item_removed" || removal.data.visit_id !== input.visit_id || removal.data.product_id !== input.product_id) throw new CartError("invalid_request");
  }
  const { error } = await client.from("events").insert({
    event_id: input.event_id, event_type: input.event_type, schema_version: 1, occurred_at: input.occurred_at,
    user_id: userId, store_id: visit.data.store_id, visit_id: visit.data.id, channel: "app", data_origin: "operated",
    selection_item_id: input.selection_item_id, product_id: input.product_id, payload: safePayload,
  });
  if (error) {
    if (["23503", "23514", "22P02"].includes(error.code)) throw new CartError("invalid_request");
    throw error;
  }
  return { recorded: true };
}
