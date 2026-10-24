export type BackendErrorCode =
  | "configuration_missing"
  | "configuration_invalid"
  | "unauthenticated"
  | "session_expired"
  | "invalid_credentials"
  | "forbidden"
  | "database_not_ready"
  | "connection_failed";

const messages: Record<BackendErrorCode, string> = {
  configuration_missing: "認証・DBの接続設定が不足しています。",
  configuration_invalid: "認証・DBの接続設定を確認してください。",
  unauthenticated: "ログインしてください。",
  session_expired: "認証の有効期限が切れました。もう一度ログインしてください。",
  invalid_credentials: "メールアドレスまたはパスワードを確認してください。",
  forbidden: "この役割での接続は許可されていません。",
  database_not_ready: "DBの接続確認用の設定がまだ適用されていません。",
  connection_failed: "認証・DBへ接続できません。時間をおいて再試行してください。",
};

export class BackendError extends Error {
  readonly code: BackendErrorCode;

  constructor(code: BackendErrorCode) {
    super(messages[code]);
    this.name = "BackendError";
    this.code = code;
  }
}

// Provider messages can contain request details; expose only our fixed messages.
export function toBackendError(error: unknown): BackendError {
  if (error instanceof BackendError) return error;
  const detail = error as { code?: string; name?: string; status?: number } | null;
  if (detail?.name === "AuthSessionMissingError") return new BackendError("unauthenticated");
  if (detail?.code === "invalid_credentials") return new BackendError("invalid_credentials");
  if (["session_expired", "session_not_found", "refresh_token_not_found", "refresh_token_already_used", "bad_jwt", "jwt_expired", "invalid_jwt", "PGRST301", "PGRST303"].includes(detail?.code ?? "")) {
    return new BackendError("session_expired");
  }
  if (detail?.code === "PGRST202") return new BackendError("database_not_ready");
  if (detail?.code === "42501" || detail?.status === 403) return new BackendError("forbidden");
  return new BackendError("connection_failed");
}

export function backendErrorStatus(error: BackendError): number {
  if (["unauthenticated", "session_expired", "invalid_credentials"].includes(error.code)) return 401;
  if (error.code === "forbidden") return 403;
  return 503;
}
