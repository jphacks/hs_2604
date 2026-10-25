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
    return NextResponse.redirect(new URL(insightPath("/login"), request.nextUrl.origin));
  }

  try {
    const client = await createServerBackendClient({ writableCookies: true });
    await signInBackend(client, credentials.email, credentials.password, "store_staff");
  } catch {
    // 失敗したまま元の画面へ戻すと往復し続けるので、ログイン画面で止める。
    return NextResponse.redirect(new URL(insightPath("/login?demo=failed"), request.nextUrl.origin));
  }

  return NextResponse.redirect(new URL(insightPath(next), request.nextUrl.origin));
}
