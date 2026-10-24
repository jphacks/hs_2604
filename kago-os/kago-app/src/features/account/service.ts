import { BackendError, backendErrorStatus, getBackendIdentity, type createHeadlessBackend } from "@kago/backend";
import { isUuid, shoppingError } from "../shopping/service.ts";
import { accountMessages, type AccountScope, type PersonalizationSettings, type PurchaseHistory, type PurchaseOrder, type SettingKey } from "./contracts.ts";

type Client = ReturnType<typeof createHeadlessBackend>;
type SettingsRow = { use_purchase_history: boolean; use_current_cart: boolean; updated_at: string };
const settingColumns = "use_purchase_history,use_current_cart,updated_at";
const toSettings = (row: SettingsRow | null): PersonalizationSettings => ({
  usePurchaseHistory: row?.use_purchase_history ?? false, useCurrentCart: row?.use_current_cart ?? false, updatedAt: row?.updated_at ?? null,
});
export class AccountError extends Error {
  readonly code: string; readonly status: number;
  constructor(code: string, status = 400) { super(accountMessages[code] ?? accountMessages.connection_failed); this.code = code; this.status = status; }
}
export function accountError(error: unknown) {
  if (error instanceof AccountError) return error;
  const safe = error instanceof BackendError ? error : shoppingError(error);
  return { code: safe.code, message: accountMessages[safe.code] ?? safe.message, status: backendErrorStatus(safe) };
}
export async function accountScope(client: Client, selectedVisit: unknown): Promise<AccountScope> {
  const { userId } = await getBackendIdentity(client, "customer");
  if (!isUuid(selectedVisit)) throw new AccountError("visit_unavailable", 409);
  const { data, error } = await client.from("visits").select("id,store_id,started_at,cart_version")
    .eq("id", selectedVisit).eq("user_id", userId).eq("status", "active").maybeSingle();
  if (error) throw error;
  if (!data) throw new AccountError("visit_unavailable", 409);
  return { userId, visitId: data.id, storeId: data.store_id, asOf: data.started_at, cartVersion: data.cart_version };
}
// Internal reads always receive a scope derived from Auth and the selected visit.
export async function readSettingsForScope(client: Client, scope: AccountScope): Promise<PersonalizationSettings> {
  const { data, error } = await client.from("customer_settings").select(settingColumns).eq("user_id", scope.userId).maybeSingle();
  if (error) throw error;
  return toSettings(data as SettingsRow | null);
}
export async function loadAccountSettings(client: Client, selectedVisit: unknown) {
  const scope = await accountScope(client, selectedVisit);
  return { scope, settings: await readSettingsForScope(client, scope) };
}

const validTimestamp = (value: unknown): value is string => typeof value === "string"
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && Number.isFinite(Date.parse(value));

export async function saveAccountSetting(client: Client, selectedVisit: unknown, input: Record<string, unknown>) {
  const scope = await accountScope(client, selectedVisit);
  if (!["usePurchaseHistory", "useCurrentCart"].includes(String(input.key)) || typeof input.value !== "boolean"
    || (input.expectedUpdatedAt !== null && !validTimestamp(input.expectedUpdatedAt))) throw new AccountError("invalid_request");
  const key = input.key as SettingKey;
  const current = await readSettingsForScope(client, scope);
  // Absolute settings are retryable. If the requested value is already saved, do not
  // bump its timestamp or replace another setting (including after a lost response).
  if (current[key] === input.value) return { scope, settings: current };
  const column = key === "usePurchaseHistory" ? "use_purchase_history" : "use_current_cart";
  if (current.updatedAt === null && input.expectedUpdatedAt === null) {
    const result = await client.from("customer_settings").insert({ user_id: scope.userId, [column]: input.value }).select(settingColumns).single();
    if (!result.error) return { scope, settings: toSettings(result.data as SettingsRow) };
    if (result.error.code !== "23505") throw result.error;
  } else if (current.updatedAt !== null && input.expectedUpdatedAt !== null) {
    const result = await client.from("customer_settings").update({ [column]: input.value }).eq("user_id", scope.userId)
      .eq("updated_at", input.expectedUpdatedAt).select(settingColumns).maybeSingle();
    if (result.error) throw result.error;
    if (result.data) return { scope, settings: toSettings(result.data as SettingsRow) };
  }
  const latest = await readSettingsForScope(client, scope);
  if (latest[key] === input.value) return { scope, settings: latest };
  throw new AccountError("settings_changed", 409);
}

function decodeCursor(cursor: string | null): { at: string; id: string } | null {
  if (cursor === null) return null;
  try {
    if (cursor.length > 250 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!validTimestamp(parsed.at) || !isUuid(parsed.id)) throw new Error();
    return parsed;
  } catch { throw new AccountError("invalid_request"); }
}
export async function historyForScope(client: Client, scope: AccountScope, cursor: string | null = null, limit = 10): Promise<PurchaseHistory> {
  const before = decodeCursor(cursor);
  let query = client.from("orders")
    .select("id,ordered_at,total,data_origin,order_items(product_id,product_name,unit_price,quantity)")
    .eq("user_id", scope.userId).eq("store_id", scope.storeId).lt("ordered_at", scope.asOf)
    .order("ordered_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (before) query = query.or(`ordered_at.lt.${before.at},and(ordered_at.eq.${before.at},id.lt.${before.id})`);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []).slice(0, limit);
  const orders: PurchaseOrder[] = rows.map(row => ({
    id: row.id, orderedAt: row.ordered_at, total: row.total, dataOrigin: row.data_origin,
    items: row.order_items.map(item => ({ productId: item.product_id, name: item.product_name, unitPrice: item.unit_price, quantity: item.quantity })),
  }));
  const last = rows.at(-1);
  return { orders, nextCursor: data && data.length > limit && last
    ? Buffer.from(JSON.stringify({ at: last.ordered_at, id: last.id })).toString("base64url") : null };
}
export async function loadPurchaseHistory(client: Client, selectedVisit: unknown, cursor: string | null = null) {
  const scope = await accountScope(client, selectedVisit);
  return { scope, ...await historyForScope(client, scope, cursor) };
}
