import { BackendError, getBackendIdentity, toBackendError, type createHeadlessBackend } from "@kago/backend";

type Client = ReturnType<typeof createHeadlessBackend>;
export type ShoppingStore = { id: string; slug: string; name: string; branch_name: string | null };
export type ShoppingVisit = { id: string; store_id: string; cart_version: number; started_at: string };
export type ShoppingLine = { productId: string; code: string; name: string; category: string; price: number; quantity: number };
export type ShoppingContext = {
  userId: string;
  demo?: { user: "U1" | "U2" | "U3"; label: string; users: { id: "U1" | "U2" | "U3"; label: string }[] };
  stores: ShoppingStore[];
  activeVisits: ShoppingVisit[];
  visit: ShoppingVisit | null;
  cart: ShoppingLine[];
};

export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function shoppingError(error: unknown): BackendError {
  const detail = error as { code?: string; message?: string } | null;
  const code = detail?.code;
  if (["42P01", "42703", "PGRST200", "PGRST202", "PGRST204", "PGRST205"].includes(code ?? "")) return new BackendError("database_not_ready");
  // DB-02/03 explicitly revoke table grants until DB-06. A missing DB grant is
  // setup still pending, not a wrong customer login. Business/RLS refusals stay 403.
  if (code === "42501" && /^permission denied for (table|schema|function)\b/i.test(detail?.message ?? "")) return new BackendError("database_not_ready");
  return toBackendError(error);
}

// All reads use the verified customer's session; DB-06 must also enforce RLS.
export async function loadShoppingContext(client: Client, selectedVisit: unknown): Promise<ShoppingContext> {
  const { userId } = await getBackendIdentity(client, "customer");
  try {
    const [storesResult, visitsResult] = await Promise.all([
      client.from("stores").select("id,slug,name,branch_name").order("name"),
      client.from("visits").select("id,store_id,cart_version,started_at").eq("user_id", userId).eq("status", "active").order("started_at", { ascending: false }),
    ]);
    if (storesResult.error) throw storesResult.error;
    if (visitsResult.error) throw visitsResult.error;
    const stores = (storesResult.data ?? []) as ShoppingStore[];
    const activeVisits = (visitsResult.data ?? []) as ShoppingVisit[];
    const visit = isUuid(selectedVisit) ? activeVisits.find(v => v.id === selectedVisit && stores.some(s => s.id === v.store_id)) ?? null : null;
    const context: ShoppingContext = { userId, stores, activeVisits, visit, cart: [] };
    // Untrusted/other-user/completed visit cookies never reach a cart query.
    if (!visit) return context;
    const items = await client.from("cart_items").select("product_id,quantity").eq("visit_id", visit.id);
    if (items.error) throw items.error;
    if (!items.data?.length) return context;
    const ids = items.data.map(item => item.product_id as string);
    const [products, prices] = await Promise.all([
      client.from("products").select("id,code,name,category").in("id", ids),
      client.from("store_products").select("product_id,price").eq("store_id", visit.store_id).in("product_id", ids),
    ]);
    if (products.error) throw products.error;
    if (prices.error) throw prices.error;
    context.cart = items.data.map(item => {
      const product = products.data?.find(p => p.id === item.product_id);
      const price = prices.data?.find(p => p.product_id === item.product_id)?.price;
      // Do not silently omit an unavailable line or substitute the local demo price.
      if (!product || !Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new BackendError("database_not_ready");
      return { productId: product.id, code: product.code, name: product.name, category: product.category, price, quantity: item.quantity };
    });
    return context;
  } catch (error) { throw shoppingError(error); }
}

export async function startShoppingVisit(client: Client, input: { storeId: string; startNew: boolean; previousVisitId: string | null }) {
  await getBackendIdentity(client, "customer");
  if (!isUuid(input.storeId) || (input.previousVisitId !== null && !isUuid(input.previousVisitId))) throw new BackendError("forbidden");
  try {
    // DB-06 grants EXECUTE on the guarded owner-rights function and denies direct
    // visit writes. Always call it with the verified customer's session.
    const result = await client.rpc("app_start_visit", {
      p_store_id: input.storeId,
      p_start_new: input.startNew,
      p_previous_visit_id: input.previousVisitId,
    });
    if (result.error) throw result.error;
    if (!isUuid(result.data)) throw new BackendError("database_not_ready");
    const context = await loadShoppingContext(client, result.data);
    if (!context.visit || context.visit.store_id !== input.storeId) throw new BackendError("forbidden");
    return context;
  } catch (error) { throw shoppingError(error); }
}
