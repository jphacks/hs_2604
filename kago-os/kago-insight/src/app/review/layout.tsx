import { USING_MOCK } from "@/lib/data-source";

export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-xl font-bold">広告審査</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          メーカーから届いた掲載申請を確認し、承認・却下します。配信中の広告はここから停止できます。
        </p>
        {USING_MOCK ? (
          <p className="mt-2 inline-block rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">
            モックデータを表示中。操作は保存されません
          </p>
        ) : null}
      </header>
      {children}
    </div>
  );
}
