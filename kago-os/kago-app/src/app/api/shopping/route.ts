import { BackendError, backendErrorStatus, signInBackend, signOutBackend } from "@kago/backend";
import { NextRequest, NextResponse } from "next/server";
import { createServerBackendClient } from "@/lib/backend/server";
import { loadShoppingContext, shoppingError, startShoppingVisit } from "@/features/shopping/service";

import { DEMO_COOKIE, isDemoUser, readDemoConfig, type DemoUser } from "@/features/demo/config";
import { loadDemoShopping } from "@/features/demo/server";

const VISIT_COOKIE = "kago-app-visit";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export const dynamic = "force-dynamic";

function failure(error: unknown) {
  const safe = shoppingError(error);
  return NextResponse.json({ code: safe.code, message: safe.code === "database_not_ready" ? "買い物機能は準備中です。店舗・来店・かごのDB設定が完了したら再試行してください。" : safe.message }, { status: backendErrorStatus(safe), headers });
}

function visitCookie(response: NextResponse, request: NextRequest, id: string) {
  response.cookies.set(VISIT_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 60 * 60 * 24 * 7 });
}
async function demoResponse(request: NextRequest, user: DemoUser) {
  const config = readDemoConfig(process.env)!;
  const context = await loadDemoShopping(config, user);
  const response = NextResponse.json(context, { headers });
  visitCookie(response, request, context.visit!.id);
  response.cookies.set(DEMO_COOKIE, user, { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 60 * 60 * 24 });
  return response;
}
export async function GET(request: NextRequest) {
  try {
    if (readDemoConfig(process.env)) {
      const user = request.cookies.get(DEMO_COOKIE)?.value ?? "U1";
      if (!isDemoUser(user)) throw new BackendError("forbidden");
      return await demoResponse(request, user);
    }
    const client = await createServerBackendClient({ writableCookies: true });
    return NextResponse.json(await loadShoppingContext(client, request.cookies.get(VISIT_COOKIE)?.value), { headers });
  } catch (error) {
    const safe = shoppingError(error);
    // SDKs may report a revoked session as missing. A selected visit means this
    // browser had a shopping session, so give the re-login explanation.
    return failure(safe.code === "unauthenticated" && request.cookies.has(VISIT_COOKIE) ? new BackendError("session_expired") : safe);
  }
}

export async function POST(request: NextRequest) {
  // Cookie-authenticated mutations require a same-origin JSON request.
  // NextURL normalizes 127.0.0.1 to localhost; compare the original Host instead.
  const expectedOrigin = `${request.nextUrl.protocol}//${request.headers.get("host")}`;
  if (request.headers.get("origin") !== expectedOrigin || !request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ code: "forbidden", message: "この操作は許可されていません。" }, { status: 403, headers });
  }
  let input;
  try { input = await request.json(); } catch {
    return NextResponse.json({ code: "invalid_request", message: "入力を確認してください。" }, { status: 400, headers });
  }
  if (!input || typeof input !== "object") return NextResponse.json({ code: "invalid_request" }, { status: 400, headers });
  try {
    if (readDemoConfig(process.env)) {
      if (input.action === "demo_select" && isDemoUser(input.user)) return await demoResponse(request, input.user);
      // In demo mode identities are chosen only from configured fictional accounts.
      throw new BackendError("forbidden");
    }
    const client = await createServerBackendClient({ writableCookies: true });
    if (input.action === "login" && typeof input.email === "string" && typeof input.password === "string" && input.email.length <= 254 && input.password.length <= 1024) {
      await signInBackend(client, input.email.trim(), input.password, "customer");
      const response = NextResponse.json({ signedIn: true }, { headers });
      response.cookies.delete(VISIT_COOKIE);
      return response;
    }
    if (input.action === "logout") {
      await signOutBackend(client);
      const response = NextResponse.json({ signedOut: true }, { headers });
      response.cookies.delete(VISIT_COOKIE);
      return response;
    }
    if (input.action === "start_visit" && typeof input.storeId === "string" && typeof input.startNew === "boolean" && (input.previousVisitId === null || typeof input.previousVisitId === "string")) {
      const context = await startShoppingVisit(client, input);
      const response = NextResponse.json(context, { headers });
      response.cookies.set(VISIT_COOKIE, context.visit!.id, { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 60 * 60 * 24 * 7 });
      return response;
    }
    return NextResponse.json({ code: "invalid_request", message: "入力を確認してください。" }, { status: 400, headers });
  } catch (error) { return failure(error); }
}
