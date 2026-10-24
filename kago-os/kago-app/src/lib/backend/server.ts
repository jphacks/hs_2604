import "server-only";

import { createServerBackend } from "@kago/backend";
import { cookies } from "next/headers";
import { getBackendConfig } from "./config";

// Enable cookie writes only in a Route Handler or Server Action.
export async function createServerBackendClient({ writableCookies = false } = {}) {
  const config = getBackendConfig();
  const cookieStore = await cookies();
  return createServerBackend(config, {
    getAll: () => cookieStore.getAll(),
    setAll(values) {
      if (writableCookies) {
        for (const { name, value, options } of values) cookieStore.set(name, value, options);
      }
    },
  });
}
