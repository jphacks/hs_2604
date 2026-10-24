/**
 * 0件・読込中・取得失敗・未計測・非公開の共通表示（common-spec.md 9.4）。
 * 「0件」と「読めていない」を見分けられるようにする。
 */

export function LoadingState({ label = "読み込み中" }: { label?: string }) {
  return (
    <div className="animate-pulse rounded-lg border border-[var(--line)] bg-[var(--panel)] p-6">
      <div className="h-4 w-24 rounded bg-[var(--line)]" />
      <div className="mt-3 h-8 w-40 rounded bg-[var(--line)]" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel)] p-6 text-sm text-[var(--muted)]">
      {message}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-6 text-sm text-red-900">
      <p className="font-bold">読み込めませんでした</p>
      <p className="mt-1">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded border border-red-300 bg-white px-3 py-1.5 font-bold"
        >
          再試行
        </button>
      ) : null}
    </div>
  );
}

/** 仕様の注記類。実測と事前投入・疑似値を混ぜないため、画面に必ず出す。 */
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 text-xs text-[var(--muted)]">{children}</p>
  );
}

export function OriginBadge({ origin }: { origin: "operated" | "seeded" | "synthetic" }) {
  if (origin === "operated") return null;
  const label = origin === "seeded" ? "事前投入データ" : "疑似値";
  return (
    <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
      {label}
    </span>
  );
}
