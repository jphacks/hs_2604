import "server-only";

/**
 * DEMO-04 デモ用の自動接続。
 *
 * ログイン「画面」を出さないだけで、認証そのものは通す。
 * RLS は全て to authenticated なので、サインインしない接続では1行も読み書きできない。
 *
 * 認証情報はサーバ側の環境変数にだけ置く。
 * NEXT_PUBLIC_ を付けないこと。付けるとビルド時にクライアントのバンドルへ埋め込まれる。
 * 環境変数が無い環境ではデモ接続は無効になり、通常のログイン画面に戻る。
 */
export type DemoCredentials = { email: string; password: string };

export function demoCredentials(): DemoCredentials | null {
  const email = process.env.KAGO_DEMO_STORE_EMAIL?.trim();
  const password = process.env.KAGO_DEMO_STORE_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}

export function isDemoAutoSignInEnabled(): boolean {
  return demoCredentials() !== null;
}

/** 戻り先は同一オリジンの絶対パスだけ許す。外部URLへ飛ばされないようにする */
export function safeNextPath(value: string | null | undefined): string {
  // Only actual screens are valid return targets. Reject protocol-relative URLs,
  // backslashes, traversal and nested sign-in routes before building a raw URL.
  return value && ["/review", "/promotions", "/metrics", "/coupons"].includes(value) ? value : "/promotions";
}
