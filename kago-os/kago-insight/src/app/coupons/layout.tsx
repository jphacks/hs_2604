export default function CouponsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-xl font-bold">クーポンの効果</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          配ったクーポンの受け取り・購入をクーポン同士で比べ、次の販促で見直す点を確認します。
        </p>
      </header>
      {children}
    </div>
  );
}
