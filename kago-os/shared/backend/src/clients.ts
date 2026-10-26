import { createBrowserClient, createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { readBackendConfig, type BackendConfig } from "./config.ts";

function options(fetcher: typeof fetch = fetch) {
  return {
    global: {
      fetch: ((input, init) => fetcher(input, {
        ...init,
        cache: "no-store",
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(10_000)])
          : AbortSignal.timeout(10_000),
      })) as typeof fetch,
    },
  };
}

export type BackendCookieScope = { name: string; path: string };

function scopedBrowserClient(url: string, publishableKey: string, cookieOptions?: BackendCookieScope) {
  return createBrowserClient(url, publishableKey, { ...options(), cookieOptions, isSingleton: false });
}
const browserClients = new Map<string, ReturnType<typeof scopedBrowserClient>>();

export function createBrowserBackend(config: BackendConfig, cookieOptions?: BackendCookieScope) {
  const { url, publishableKey } = readBackendConfig(config);
  // The SDK default singleton ignores cookie scopes. Cache per project and scope,
  // and never share clients across server-rendered requests.
  const key = JSON.stringify([url, publishableKey, cookieOptions?.name, cookieOptions?.path]);
  const browser = typeof window !== "undefined";
  if (browser) {
    const existing = browserClients.get(key);
    if (existing) return existing;
  }
  const client = scopedBrowserClient(url, publishableKey, cookieOptions);
  if (browser) browserClients.set(key, client);
  return client;
}

export function createServerBackend(config: BackendConfig, cookies: CookieMethodsServer, fetcher?: typeof fetch, cookieOptions?: BackendCookieScope) {
  const { url, publishableKey } = readBackendConfig(config);
  return createServerClient(url, publishableKey, { ...options(fetcher), cookies, cookieOptions });
}

// For a terminal or a dedicated Signage process. Keep its session in memory only.
export function createHeadlessBackend(config: BackendConfig, fetcher?: typeof fetch) {
  const { url, publishableKey } = readBackendConfig(config);
  return createClient(url, publishableKey, {
    ...options(fetcher),
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
