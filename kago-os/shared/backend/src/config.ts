import { BackendError } from "./errors.ts";

export type BackendConfig = { url: string; publishableKey: string };

export function readBackendConfig(values: { url?: string; publishableKey?: string }): BackendConfig {
  const url = values.url?.trim();
  const key = values.publishableKey?.trim();
  if (!url || !key) throw new BackendError("configuration_missing");
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new BackendError("configuration_invalid"); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if ((parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new BackendError("configuration_invalid");
  }
  // Accept only modern public keys. This also rejects legacy service_role JWTs.
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) throw new BackendError("configuration_invalid");
  return { url: parsed.origin, publishableKey: key };
}
