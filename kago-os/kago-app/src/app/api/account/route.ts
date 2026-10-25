import { NextRequest, NextResponse } from "next/server";
import { createServerBackendClient } from "@/lib/backend/server";
import { accountError, AccountError, loadAccountSettings, loadPurchaseHistory, saveAccountSetting } from "@/features/account/service";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export const dynamic = "force-dynamic";
const failure = (error: unknown) => {
  const safe = accountError(error);
  return NextResponse.json({ code: safe.code, message: safe.message }, { status: safe.status, headers });
};
export async function GET(request: NextRequest) {
  try {
    const client = await createServerBackendClient({ writableCookies: true });
    const visit = request.cookies.get("kago-app-visit")?.value;
    const data = request.nextUrl.searchParams.has("history")
      ? await loadPurchaseHistory(client, visit, request.nextUrl.searchParams.get("cursor"), request.nextUrl.searchParams.get("store"))
      : await loadAccountSettings(client, visit);
    return NextResponse.json(data, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const origin = `${request.nextUrl.protocol}//${request.headers.get("host")}`;
    if (request.headers.get("origin") !== origin || !request.headers.get("content-type")?.startsWith("application/json")) throw new AccountError("forbidden", 403);
    let input;
    try { input = await request.json(); } catch { throw new AccountError("invalid_request"); }
    const visit = request.cookies.get("kago-app-visit")?.value;
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new AccountError("invalid_request");
    if (input.visitId !== visit) throw new AccountError("visit_unavailable", 409);
    const client = await createServerBackendClient({ writableCookies: true });
    return NextResponse.json(await saveAccountSetting(client, visit, input), { headers });
  } catch (error) { return failure(error); }
}
