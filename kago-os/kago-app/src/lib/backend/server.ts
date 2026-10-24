import "server-only";

import { createServerBackend } from "@kago/backend";
import { cookies } from "next/headers";
import { DEMO_COOKIE, isDemoUser, readDemoConfig } from "@/features/demo/config";
import { getDemoBackendClient } from "@/features/demo/server";
import { BackendError } from "@kago/backend";
import { getBackendConfig } from "./config";

// Enable cookie writes only in a Route Handler or Server Action.
export async function createServerBackendClient({ writableCookies = false } = {}) {
  const config = getBackendConfig();
  const cookieStore = await cookies();
  const demo = readDemoConfig(process.env);
  if (demo) {
    const user = cookieStore.get(DEMO_COOKIE)?.value ?? "U1";
    if (!isDemoUser(user)) throw new BackendError("forbidden");
    return getDemoBackendClient(demo, user);
  }
  return createServerBackend(config, {
    getAll: () => cookieStore.getAll(),
    setAll(values) {
      if (writableCookies) {
        for (const { name, value, options } of values) cookieStore.set(name, value, options);
      }
    },
  });
}
