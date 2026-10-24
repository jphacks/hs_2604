import { NextRequest, NextResponse } from "next/server";
import { createServerBackendClient } from "@/lib/backend/server";
import { loadRecommendationInput } from "@/features/recommendations/input";
import { accountError } from "@/features/account/service";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(request: NextRequest) {
  try {
    const client = await createServerBackendClient({ writableCookies: true });
    return NextResponse.json(await loadRecommendationInput(client, request.cookies.get("kago-app-visit")?.value), { headers });
  } catch (error) {
    const safe = accountError(error);
    return NextResponse.json({ code: safe.code, message: safe.message }, { status: safe.status, headers });
  }
}
