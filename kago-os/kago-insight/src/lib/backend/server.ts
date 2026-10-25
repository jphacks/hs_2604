import "server-only";

import { createServerBackend } from "@kago/backend";
import { cookies } from "next/headers";
import { insightCookieScope } from "../paths";
import { getBackendConfig } from "./config";

// Cookie の書き込みは Route Handler か Server Action の中だけで有効にする。
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
  }, undefined, insightCookieScope);
}
