import { AdsHeader } from "@/features/shell/ads-header";

export default function AdsLayout({ children }: LayoutProps<"/ads">) {
  return (
    <>
      <AdsHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <footer className="border-t border-line px-6 py-4 text-center text-xs text-muted">
        仮データで動いています（DB-04・COM-02 ができたら Supabase に切り替え）。店舗・メーカー・商品はデモ用の架空のものです。
      </footer>
    </>
  );
}
