import { accountMessages } from "./contracts";

export async function accountRequest(path = "/api/account", body?: object, signal?: AbortSignal) {
  const response = await fetch(path, { method: body ? "POST" : "GET", cache: "no-store", credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) });
  const data = await response.json();
  if (!response.ok) throw { code: data.code, status: response.status };
  return data;
}
export const accountFailureMessage = (error: unknown) => accountMessages[(error as { code?: string })?.code ?? ""] ?? accountMessages.connection_failed;
export const isAccountAuthFailure = (error: unknown) => ["unauthenticated", "session_expired", "forbidden", "visit_unavailable"].includes((error as { code?: string })?.code ?? "");
