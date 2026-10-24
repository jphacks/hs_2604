// 見出しは期間・比較・サンプルデータ表示と同じ行に置くため、画面側（CouponEffectScreen）で持つ。
export default function CouponsLayout({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-6">{children}</div>;
}
