import { NextRequest, NextResponse } from "next/server";
import { createServerBackendClient } from "@/lib/backend/server";
import { CartError, cartError } from "@/features/cart/service";
import { loadSerendipityOffers, recordOfferEvent } from "@/features/offers/service";
import { ASSOCIATION_RULES } from "@/features/recommendations/association-rules";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export const dynamic = "force-dynamic";
const failure = (error: unknown) => {
  const safe = cartError(error);
  return NextResponse.json({ code: safe.code, message: safe.message }, { status: safe.status, headers });
};
// Store offers the selected visit can use now, ranked with the APP-04 rules (APP-13).
export async function GET(request: NextRequest) {
  try {
    const client = await createServerBackendClient({ writableCookies: true });
    return NextResponse.json(await loadSerendipityOffers(client, request.cookies.get("kago-app-visit")?.value, ASSOCIATION_RULES), { headers });
  } catch (error) { return failure(error); }
}
// Shown / opened / dismissed log. Claims go through /api/cart because they change the cart.
export async function POST(request: NextRequest) {
  try {
    const origin = `${request.nextUrl.protocol}//${request.headers.get("host")}`;
    if (request.headers.get("origin") !== origin || !request.headers.get("content-type")?.startsWith("application/json")) throw new CartError("forbidden", 403);
    let input;
    try { input = await request.json(); } catch { throw new CartError("invalid_request"); }
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new CartError("invalid_request");
    const visitId = request.cookies.get("kago-app-visit")?.value;
    if (input.visitId !== visitId) throw new CartError("visit_ended", 409);
    const client = await createServerBackendClient({ writableCookies: true });
    return NextResponse.json(await recordOfferEvent(client, visitId, input), { headers });
  } catch (error) { return failure(error); }
}
