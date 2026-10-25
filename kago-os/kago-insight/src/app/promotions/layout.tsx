import { USING_MOCK } from "@/lib/mode";

export default function PromotionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-bold">販促設定</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">おすすめ商品を設定し、Appに届ける</p>
        </div>
        <a
          href="https://kago-os.vercel.app/App"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-[var(--accent)] bg-white px-4 py-2.5 text-sm font-bold text-[var(--accent)]"
        >
          Appで表示を確認 ↗
        </a>
      </header>
      {USING_MOCK ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
          モックデータを表示中。操作は保存されません
        </p>
      ) : null}
      {children}
    </div>
  );
}
