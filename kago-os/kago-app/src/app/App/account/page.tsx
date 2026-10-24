"use client";

import Link from "next/link";
import { useCart } from "@/features/cart/cart-provider";
import { useShoppingSession } from "@/features/shopping/session-provider";

export default function AccountPage() {
  const session = useShoppingSession();
  const { itemCount } = useCart();
  const store = session.stores.find(store => store.id === session.visit!.store_id)!;
  return (
    <main className="min-h-screen bg-[#f4f7f5] px-4 py-8 text-slate-950">
      <div className="mx-auto grid max-w-xl gap-6">
        <Link href="/App" className="min-h-11 text-sm font-bold text-emerald-800 underline">買い物画面へ戻る</Link>
        <h1 className="text-2xl font-black">マイページ</h1>
        <section className="rounded-3xl border border-emerald-100 bg-white p-6">
          <h2 className="font-bold">ログイン中の買い物</h2>
          <p className="mt-3">{store.name} {store.branch_name}</p>
          <p className="mt-2 text-sm text-slate-600">かご {itemCount}点</p>
          <p className="mt-2 text-sm text-slate-600">開始日時：{new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" }).format(new Date(session.visit!.started_at))}</p>
        </section>
        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="font-bold">購入履歴・おすすめ設定</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">購入履歴とその利用設定は準備中です。</p>
        </section>
      </div>
    </main>
  );
}
