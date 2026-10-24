import { NextRequest, NextResponse } from "next/server";
import { createServerBackendClient } from "@/lib/backend/server";
import { accountError } from "@/features/account/service";
import { selectAndSave } from "@/features/recommendations/selection-service";
import { ASSOCIATION_RULES } from "@/features/recommendations/association-rules";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
// APP-05: choose and save the suggestion slots for the selected visit's current cart (APP-06 shows them).
export async function GET(request: NextRequest) {
  try {
    const client = await createServerBackendClient({ writableCookies: true });
    return NextResponse.json(await selectAndSave(client, request.cookies.get("kago-app-visit")?.value, ASSOCIATION_RULES), { headers });
  } catch (error) {
    const safe = accountError(error);
    return NextResponse.json({ code: safe.code, message: safe.message }, { status: safe.status, headers });
  }
}
