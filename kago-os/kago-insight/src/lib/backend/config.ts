import { readBackendConfig } from "@kago/backend";

export function getBackendConfig() {
  // 直接参照のまま置く。Next.js は NEXT_PUBLIC_* をビルド時に値へ置換するため。
  return readBackendConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
