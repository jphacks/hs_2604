import { NextRequest, NextResponse } from "next/server";
import { createServerBackendClient } from "@/lib/backend/server";
import { CartError, cartError, claimOffer, listProducts, lookupProduct, readCart, setCartItem } from "@/features/cart/service";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export const dynamic = "force-dynamic";
const failure = (error: unknown) => {
  const safe = cartError(error);
  return NextResponse.json({ code: safe.code, message: safe.message }, { status: safe.status, headers });
};
export async function GET(request: NextRequest) {
  try {
    const client = await createServerBackendClient({ writableCookies: true });
    const visitId = request.cookies.get("kago-app-visit")?.value ?? "";
    const query = request.nextUrl.searchParams;
    const result = query.has("products")
      ? await listProducts(client, visitId, query.get("q") ?? "", Number(query.get("offset") ?? 0))
      : await readCart(client, visitId);
    return NextResponse.json(result, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const expectedOrigin = `${request.nextUrl.protocol}//${request.headers.get("host")}`;
    if (request.headers.get("origin") !== expectedOrigin || !request.headers.get("content-type")?.startsWith("application/json")) throw new CartError("forbidden", 403);
    let input;
    try { input = await request.json(); } catch { throw new CartError("invalid_request"); }
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new CartError("invalid_request");
    const visitId = request.cookies.get("kago-app-visit")?.value ?? "";
    // A request created before another tab switches stores must never target the new cookie.
    if (input.visitId !== visitId) throw new CartError("visit_ended", 409);
    const client = await createServerBackendClient({ writableCookies: true });
    if (input.action === "lookup") return NextResponse.json({ product: await lookupProduct(client, visitId, input) }, { headers });
    if (input.action === "set") return NextResponse.json(await setCartItem(client, visitId, input), { headers });
    if (input.action === "claim") return NextResponse.json(await claimOffer(client, visitId, input), { headers });
    throw new CartError("invalid_request");
  } catch (error) { return failure(error); }
}
