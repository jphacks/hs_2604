import { getBackendIdentity, BackendError, backendErrorStatus, type createHeadlessBackend } from "@kago/backend";
import { isUuid, shoppingError } from "../shopping/service.ts";
import { cartMessages, type CartOperation, type CartSnapshot, type OfferClaim, type ProductPage, type StoreProduct } from "./contracts.ts";

type Client = ReturnType<typeof createHeadlessBackend>;
export class CartError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 400) {
    super(cartMessages[code] ?? cartMessages.connection_failed);
    this.code = code;
    this.status = status;
  }
}
export function cartError(error: unknown): { code: string; message: string; status: number } {
  if (error instanceof CartError) return error;
  const detail = error as { code?: string; details?: string } | null;
  if (detail?.code === "40001") return new CartError("cart_changed", 409);
  if (detail?.code === "23505") return new CartError("request_conflict", 409);
  if (["22023", "22P02", "22003"].includes(detail?.code ?? "")) return new CartError("invalid_request");
  if (detail?.code === "P0001" && ["product_not_found", "product_unavailable", "visit_ended", "offer_unavailable", "offer_claimed", "trigger_missing"].includes(detail.details ?? "")) return new CartError(detail.details!, 409);
  const safe = error instanceof BackendError ? error : shoppingError(error);
  return { code: safe.code, message: cartMessages[safe.code] ?? safe.message, status: backendErrorStatus(safe) };
}
async function customer(client: Client, visitId: unknown): Promise<string> {
  const { userId } = await getBackendIdentity(client, "customer");
  if (!isUuid(visitId)) throw new CartError("visit_ended", 409);
  return userId;
}
export async function readCart(client: Client, visitId: string): Promise<CartSnapshot> {
  await customer(client, visitId);
  const { data, error } = await client.rpc("app_get_cart", { p_visit_id: visitId });
  if (error) throw error;
  return data as CartSnapshot;
}
export async function listProducts(client: Client, visitId: string, query: string, offset: number): Promise<ProductPage> {
  await customer(client, visitId);
  if (query.length > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) throw new CartError("invalid_request");
  const { data, error } = await client.rpc("app_list_products", { p_visit_id: visitId, p_query: query.trim(), p_offset: offset });
  if (error) throw error;
  return data as ProductPage;
}
export async function lookupProduct(client: Client, visitId: string, input: Record<string, unknown>): Promise<StoreProduct> {
  await customer(client, visitId);
  const targets = [input.code, input.productId, input.failureReason].filter(value => value !== undefined && value !== null);
  if (!isUuid(input.requestId) || targets.length !== 1
    || (input.productId !== undefined && !isUuid(input.productId))
    || (input.failureReason !== undefined && !["camera_unavailable", "permission_denied", "unreadable"].includes(String(input.failureReason)))
    || (input.code !== undefined && (typeof input.code !== "string" || input.code.trim().length === 0 || input.code.length > 100))) throw new CartError("invalid_request");
  const { data, error } = await client.rpc("app_lookup_product", {
    p_visit_id: visitId, p_request_id: input.requestId,
    p_code: typeof input.code === "string" ? input.code.trim() : null, p_product_id: input.productId ?? null,
    p_failure_reason: input.failureReason ?? null,
  });
  if (error) throw error;
  if (data?.code) throw new CartError(data.code, 409);
  return data.product as StoreProduct;
}
export async function setCartItem(client: Client, visitId: string, input: CartOperation): Promise<CartSnapshot> {
  await customer(client, visitId);
  if (input.visitId !== visitId || !isUuid(input.requestId) || !isUuid(input.productId)
    || !Number.isSafeInteger(input.quantity) || input.quantity < 0 || input.quantity > 999
    || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0
    || !["scan", "manual"].includes(input.source)) throw new CartError("invalid_request");
  const { data, error } = await client.rpc("app_set_cart_item", {
    p_visit_id: visitId, p_request_id: input.requestId, p_product_id: input.productId,
    p_quantity: input.quantity, p_expected_cart_version: input.expectedVersion, p_source: input.source,
  });
  if (error) throw error;
  return data as CartSnapshot;
}
// APP-13: accept a store offer. The DB re-checks the offer window, store, trigger and version.
export async function claimOffer(client: Client, visitId: string, input: OfferClaim): Promise<CartSnapshot> {
  await customer(client, visitId);
  if (input.visitId !== visitId || !isUuid(input.requestId) || !isUuid(input.offerId)
    || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) throw new CartError("invalid_request");
  const { data, error } = await client.rpc("app_claim_offer", {
    p_visit_id: visitId, p_request_id: input.requestId, p_offer_id: input.offerId, p_expected_cart_version: input.expectedVersion,
  });
  if (error) throw error;
  return data as CartSnapshot;
}
