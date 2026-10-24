import { readBackendConfig } from "@kago/backend";

export function getBackendConfig() {
  // Keep direct property access: Next.js replaces NEXT_PUBLIC_* at build time.
  return readBackendConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
