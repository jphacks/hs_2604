import { USING_MOCK } from "@/lib/data-source";

export default function MetricsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-xl font-bold">成果</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          提案の表示から購入までを、種別ごとに確認します。次にどの施策を直すかを決めるための画面です。
        </p>
        {USING_MOCK ? (
          <p className="mt-2 inline-block rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">
            モックデータを表示中。値は common-spec.md 11.3・11.4 の期待値と一致します
          </p>
        ) : null}
      </header>
      {children}
    </div>
  );
}
