import { NextRequest, NextResponse } from "next/server";
import { createServerBackendClient } from "@/lib/backend/server";
import { CartError, cartError } from "@/features/cart/service";
import { recordAppEvent } from "@/features/events/service";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function POST(request: NextRequest) {
  try {
    const origin = `${request.nextUrl.protocol}//${request.headers.get("host")}`;
    if (request.headers.get("origin") !== origin || !request.headers.get("content-type")?.startsWith("application/json")) throw new CartError("forbidden", 403);
    const body = await request.text();
    if (body.length > 8192) throw new CartError("invalid_request");
    let input;
    try { input = JSON.parse(body); } catch { throw new CartError("invalid_request"); }
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new CartError("invalid_request");
    const client = await createServerBackendClient({ writableCookies: true });
    return NextResponse.json(await recordAppEvent(client, input), { headers });
  } catch (error) {
    const safe = cartError(error);
    return NextResponse.json({ code: safe.code }, { status: safe.status, headers });
  }
}
