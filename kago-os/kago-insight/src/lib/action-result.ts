/**
 * 画面が受け取る操作結果。クライアント側からも読むので server-only は付けない。
 * 分類は PostgreSQL のエラーコードに対応する（DB-08）。
 */
export type ActionErrorCode =
  | "not_staff" // 42501
  | "revision_changed" // 40001 + detail revision_changed
  | "conflict" // 23505
  | "invalid_state" // 23514
  | "invalid_argument" // 22023
  | "unauthenticated" // セッション切れ
  | "unknown";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ActionErrorCode; message: string };

export function actionErrorMessage(code: ActionErrorCode): string {
  switch (code) {
    case "not_staff":
      return "この申請は自店舗のものではないため操作できません。";
    case "revision_changed":
      return "この画面を開いた後にメーカーが再申請しました。内容が変わっているので、再読み込みしてから確認してください。";
    case "conflict":
      return "すでに別の内容で審査されています。再読み込みしてください。";
    case "invalid_state":
      return "この状態では実行できません。期間・掲載先・配信状態を確認してください。";
    case "invalid_argument":
      return "入力内容が正しくありません。理由は1〜200文字で入力してください。";
    case "unauthenticated":
      return "ログインの有効期限が切れました。もう一度ログインしてください。";
    case "unknown":
      return "処理できませんでした。時間をおいて再度お試しください。";
  }
}

/**
 * PostgREST が返すエラーを分類に写す。
 * 40001 は再試行可能な直列化エラー全般なので、詳細が revision_changed のときだけ
 * 「メーカーが再申請した」と言い切る。
 */
export function classifyPostgresError(error: unknown): ActionErrorCode {
  const detail = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const code = detail?.code ?? "";
  const text = `${detail?.message ?? ""} ${detail?.details ?? ""} ${detail?.hint ?? ""}`;
  if (code === "42501") return "not_staff";
  if (code === "40001") return text.includes("revision_changed") ? "revision_changed" : "conflict";
  if (code === "23505") return "conflict";
  if (code === "23514" || code === "23503") return "invalid_state";
  if (code === "22023") return "invalid_argument";
  if (["PGRST301", "PGRST303", "bad_jwt", "jwt_expired"].includes(code)) return "unauthenticated";
  return "unknown";
}

export function actionFailure(error: unknown): { ok: false; code: ActionErrorCode; message: string } {
  const code = classifyPostgresError(error);
  return { ok: false, code, message: actionErrorMessage(code) };
}
