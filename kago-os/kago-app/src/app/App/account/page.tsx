"use client";

import Link from "next/link";
import { useCart } from "@/features/cart/cart-provider";
import { useShoppingSession } from "@/features/shopping/session-provider";
import { PersonalizationProvider, usePersonalization } from "@/features/recommendations/personalization-provider";
import { PurchaseHistorySection } from "@/features/account/purchase-history";
import type { SettingKey } from "@/features/account/contracts";

export default function AccountPage() {
  return <PersonalizationProvider><AccountContent /></PersonalizationProvider>;
}

function AccountContent() {
  const session = useShoppingSession();
  const preference = usePersonalization();
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
        <section aria-labelledby="preferences-heading" className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
          <p className="text-xs font-black tracking-wider text-emerald-700">YOUR CHOICE</p>
          <h2 id="preferences-heading" className="mt-1 text-xl font-black">おすすめへの利用設定</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">設定は全店舗共通で、お使いのアカウントに保存されます。OFFにしても、買い物や購入履歴の確認はできます。</p>
          {!preference.settings && preference.busy && <p role="status" className="mt-4 text-sm">設定を読み込んでいます…</p>}
          {preference.settings && <div className="mt-4 divide-y divide-slate-100">
            {([
              ["usePurchaseHistory", "購入履歴をおすすめに使う", "この店舗で過去に購入した商品を、おすすめの参考にします。"],
              ["useCurrentCart", "かごをおすすめに使う", "今回かごに入れた商品を、おすすめの参考にします。"],
            ] as [SettingKey, string, string][]).map(([key, label, description]) => <label key={key} className="flex cursor-pointer items-center justify-between gap-4 py-4">
              <span><span className="block text-sm font-bold">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span></span>
              <span className="flex shrink-0 items-center gap-2"><span className="text-xs font-bold text-emerald-800">{preference.settings![key] ? "ON" : "OFF"}</span><input type="checkbox" role="switch" aria-label={label} checked={preference.settings![key]} disabled={preference.busy || preference.pending} onChange={e => preference.updateSetting(key, e.target.checked)} className="size-6 accent-emerald-700 disabled:opacity-40" /></span>
            </label>)}
          </div>}
          {preference.message && <p role={preference.error ? "alert" : "status"} className={`mt-3 rounded-xl p-3 text-sm ${preference.error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-950"}`}>{preference.message}</p>}
          {preference.pending && <button type="button" disabled={preference.busy} onClick={preference.retry} className="mt-3 min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-40">同じ設定を再試行</button>}
          <button type="button" disabled={preference.busy} onClick={preference.reload} className="mt-3 min-h-11 w-full text-sm text-emerald-800 underline disabled:opacity-40">設定を再読み込み</button>
        </section>
        <PurchaseHistorySection />
      </div>
    </main>
  );
}
