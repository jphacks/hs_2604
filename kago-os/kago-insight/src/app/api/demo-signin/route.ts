import { signInBackend } from "@kago/backend";
import { NextResponse, type NextRequest } from "next/server";
import { createServerBackendClient } from "@/lib/backend/server";
import { insightPath } from "@/lib/paths";
import { demoCredentials, safeNextPath } from "@/lib/demo";

/**
 * デモ用アカウントでサーバ側だけでサインインし、元の画面へ戻す。
 * Cookie を書くので Route Handler に置く（Server Component からは書けない）。
 * 認証情報は環境変数から読むだけで、応答にもブラウザにも出さない。
 */
export async function GET(request: NextRequest) {
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const credentials = demoCredentials();

  // 環境変数が無ければデモ接続は無効。通常のログイン画面へ。
  if (!credentials) {
    return new NextResponse(null, { status: 307, headers: { Location: insightPath("/login"), "Cache-Control": "private, no-store" } });
  }

  try {
    const client = await createServerBackendClient({ writableCookies: true });
    await signInBackend(client, credentials.email, credentials.password, "store_staff");
  } catch {
    // 失敗したまま元の画面へ戻すと往復し続けるので、ログイン画面で止める。
    return new NextResponse(null, { status: 307, headers: { Location: insightPath("/login?demo=failed"), "Cache-Control": "private, no-store" } });
  }

  return new NextResponse(null, { status: 307, headers: { Location: insightPath(next), "Cache-Control": "private, no-store" } });
}
