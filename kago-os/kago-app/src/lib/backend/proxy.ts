import { createServerBackend } from "@kago/backend";
import { NextResponse, type NextRequest } from "next/server";
import { readDemoConfig } from "@/features/demo/config";
import { getBackendConfig } from "./config";

export async function updateBackendSession(request: NextRequest) {
  if (readDemoConfig(process.env)) {
    const response = NextResponse.next({ request });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  let config;
  try { config = getBackendConfig(); } catch {
    // The existing local demo stays usable without a connected backend.
    // /api/backend/connection reports the explicit configuration error.
    return NextResponse.next({ request });
  }
  let response = NextResponse.next({ request });
  const cacheHeaders: Record<string, string> = {};
  const client = createServerBackend(config, {
    getAll: () => request.cookies.getAll(),
    setAll(values, headers) {
      for (const { name, value } of values) request.cookies.set(name, value);
      response = NextResponse.next({ request });
      for (const { name, value, options } of values) response.cookies.set(name, value, options);
      Object.assign(cacheHeaders, headers);
      for (const [name, value] of Object.entries(cacheHeaders)) response.headers.set(name, value);
    },
  });
  // Refresh only; every protected data operation must verify the user separately.
  // Never erase a session just because Auth is temporarily unreachable.
  await client.auth.getUser().catch(() => undefined);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
