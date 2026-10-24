import { NextRequest, NextResponse } from "next/server";
import { createServerBackendClient } from "@/lib/backend/server";
import { accountError } from "@/features/account/service";
import { loadRegularReminders } from "@/features/recommendations/reminders";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
// #152: "そろそろ買う頃" regular purchases of the selected visit's customer (history use ON only).
export async function GET(request: NextRequest) {
  try {
    const client = await createServerBackendClient({ writableCookies: true });
    return NextResponse.json(await loadRegularReminders(client, request.cookies.get("kago-app-visit")?.value), { headers });
  } catch (error) {
    const safe = accountError(error);
    return NextResponse.json({ code: safe.code, message: safe.message }, { status: safe.status, headers });
  }
}
