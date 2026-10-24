export default function CouponsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-xl font-bold">クーポンの効果</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          配ったクーポンが、どれだけ受け取られ、購入につながったかを確認します。
        </p>
      </header>
      {children}
    </div>
  );
}
