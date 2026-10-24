import { NextResponse, type NextRequest } from "next/server";

/**
 * 今開いている画面のパスをヘッダへ載せるだけ。認証はここでは行わない。
 * Server Component からはパスを直接読めないため、未ログイン時の戻り先を作るのに使う。
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-kago-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|mock).*)"],
};
