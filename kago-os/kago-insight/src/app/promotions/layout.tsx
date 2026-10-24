import { USING_MOCK } from "@/lib/mode";

export default function PromotionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-xl font-bold">販促設定</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          自店で押したい商品を設定します。値引きはクーポンとして、おすすめは「店舗からのおすすめ」として、
          アプリとサイネージに出ます。
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
