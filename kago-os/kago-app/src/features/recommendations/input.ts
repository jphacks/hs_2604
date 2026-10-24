import type { createHeadlessBackend } from "@kago/backend";
import { accountScope, AccountError, historyForScope, readSettingsForScope } from "../account/service.ts";
import { buildPurchaseSummaries } from "./customer.ts";
import type { PurchaseHistory } from "../account/contracts.ts";

// APP-05 must obtain a fresh input through this server function for each selection.
// It must not substitute old client settings or a cached/demo history after opt-out.
export async function loadRecommendationInput(client: ReturnType<typeof createHeadlessBackend>, selectedVisit: unknown) {
  const scope = await accountScope(client, selectedVisit);
  const settings = await readSettingsForScope(client, scope);
  let history: PurchaseHistory = { orders: [], nextCursor: null };
  let cart: { productId: string; quantity: number }[] = [];
  if (settings.usePurchaseHistory) history = await historyForScope(client, scope, null, 50);
  if (settings.useCurrentCart) {
    const { data, error } = await client.from("cart_items").select("product_id,quantity").eq("visit_id", scope.visitId);
    if (error) throw error;
    cart = (data ?? []).map(item => ({ productId: item.product_id, quantity: item.quantity }));
  }
  // An OFF change while data is loading must invalidate the in-flight input as well.
  const latest = await readSettingsForScope(client, scope);
  const latestScope = await accountScope(client, selectedVisit);
  if (latest.updatedAt !== settings.updatedAt || latest.usePurchaseHistory !== settings.usePurchaseHistory
    || latest.useCurrentCart !== settings.useCurrentCart || latestScope.cartVersion !== scope.cartVersion) throw new AccountError("input_changed", 409);
  return { scope, settings,
    history: { status: !settings.usePurchaseHistory ? "disabled" : history.orders.length ? "available" : "empty",
      orders: history.orders, summaries: buildPurchaseSummaries(history.orders, scope.asOf), hasMore: history.nextCursor !== null, limit: 50 },
    cart: { status: !settings.useCurrentCart ? "disabled" : cart.length ? "available" : "empty", items: cart },
  };
}
