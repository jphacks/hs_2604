import { BackendError, createBrowserBackend, readBackendConfig } from "@kago/backend";

export function adsDataSource(value = process.env.NEXT_PUBLIC_ADS_DATA_SOURCE): "mock" | "supabase" {
  if (value === "mock") return "mock";
  if (!value || value === "supabase") return "supabase";
  throw new BackendError("configuration_invalid");
}

export function createAdsBackend() {
  return createBrowserBackend(readBackendConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  }));
}
