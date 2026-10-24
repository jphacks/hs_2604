"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useCart } from "@/features/cart/cart-provider";
import {
  PersonalizationSettings,
  usePersonalization,
} from "@/features/recommendations/personalization-provider";
import { PurchaseRecord, TEST_CUSTOMER } from "@/features/recommendations/customer";
import { Product, SHOP_PRODUCT_LIST } from "@/lib/products";
import { MENU_PRODUCT_IMAGES, productIcon } from "@/lib/product-visuals";

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
});

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const PRODUCT_BY_CODE: Record<string, Product> = Object.fromEntries(
  SHOP_PRODUCT_LIST.map((product) => [product.code, product]),
);

function purchaseTotal(purchase: PurchaseRecord) {
  return purchase.items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );
}

function SettingRow({
  title,
  description,
  settingKey,
  value,
  onChange,
}: {
  title: string;
  description: string;
  settingKey: keyof PersonalizationSettings;
  value: boolean;
  onChange: (key: keyof PersonalizationSettings, value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-4 border-b border-slate-100 py-4 last:border-0">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black text-slate-950">{title}</span>
        <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{description}</span>
      </span>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={value}
        onChange={(event) => onChange(settingKey, event.target.checked)}
      />
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-slate-300 transition peer-checked:bg-emerald-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-700 after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition peer-checked:after:translate-x-5" aria-hidden="true" />
    </label>
  );
}

export default function AccountPage() {
  const { itemCount, addItems } = useCart();
  const { settings, updateSetting } = usePersonalization();
  const [addedOrderId, setAddedOrderId] = useState<string | null>(null);
  const purchases = useMemo(
    () => [...TEST_CUSTOMER.purchaseHistory].reverse(),
    [],
  );

  const addPurchaseAgain = (purchase: PurchaseRecord) => {
    const items = purchase.items.flatMap((item) => {
      const product = PRODUCT_BY_CODE[item.productCode];
      return product ? [{ product, quantity: item.quantity }] : [];
    });
    addItems(items);
    setAddedOrderId(purchase.id);
  };

  return (
    <main className="min-h-screen bg-[#f4f7f5] pb-12 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-emerald-100/80 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-xl items-center justify-between px-4 pb-3.5 pt-[max(0.875rem,env(safe-area-inset-top))] sm:px-5">
          <div className="flex items-center gap-3">
            <Link href="/App" className="grid size-11 place-items-center rounded-full bg-slate-100 text-xl font-black transition active:scale-95" aria-label="買い物画面へ戻る">←</Link>
            <div><p className="text-[11px] font-black tracking-[0.16em] text-emerald-700">KAGO/APP</p><h1 className="text-xl font-black tracking-[-0.04em]">マイページ</h1></div>
          </div>
          <Link href="/App" className="rounded-full bg-slate-950 px-4 py-2.5 text-xs font-black text-white">かご {itemCount}点</Link>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-xl gap-6 px-4 py-5">
        <section className="overflow-hidden rounded-3xl bg-slate-950 p-5 text-white shadow-lg">
          <div className="flex items-center gap-4">
            <div className="grid size-16 shrink-0 place-items-center rounded-full bg-emerald-400 text-2xl font-black text-slate-950">美</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-black">{TEST_CUSTOMER.profile.displayName}</h2><span className="rounded-full bg-amber-300 px-2 py-1 text-[10px] font-black text-slate-950">TEST USER</span></div>
              <p className="mt-1 truncate text-sm text-slate-300">{TEST_CUSTOMER.account.email}</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/10 pt-4 text-center">
            <div><p className="text-lg font-black">{TEST_CUSTOMER.purchaseHistory.length}</p><p className="text-[10px] font-bold text-slate-400">購入回数</p></div>
            <div><p className="text-lg font-black">{TEST_CUSTOMER.profile.household.size}人</p><p className="text-[10px] font-bold text-slate-400">世帯人数</p></div>
            <div><p className="text-lg font-black">{TEST_CUSTOMER.profile.ageBand}</p><p className="text-[10px] font-bold text-slate-400">年代</p></div>
          </div>
        </section>

        <section aria-labelledby="profile-heading">
          <div className="mb-3 px-1"><p className="text-xs font-black text-emerald-700">PROFILE</p><h2 id="profile-heading" className="text-xl font-black">アカウント情報</h2></div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <dl className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-4 text-sm">
              <dt className="font-bold text-slate-500">居住エリア</dt><dd className="font-black">{TEST_CUSTOMER.profile.area}</dd>
              <dt className="font-bold text-slate-500">世帯構成</dt><dd className="font-black">大人{TEST_CUSTOMER.profile.household.adults}人・子ども{TEST_CUSTOMER.profile.household.children}人</dd>
              <dt className="font-bold text-slate-500">買い物傾向</dt><dd className="flex flex-wrap gap-1.5">{TEST_CUSTOMER.profile.shoppingPreferences.map((item) => <span key={item} className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-800">{item}</span>)}</dd>
            </dl>
          </div>
        </section>

        <section aria-labelledby="history-heading">
          <div className="mb-3 flex items-end justify-between px-1"><div><p className="text-xs font-black text-emerald-700">HISTORY</p><h2 id="history-heading" className="text-xl font-black">購入履歴</h2></div><p className="text-xs font-bold text-slate-500">全{purchases.length}件</p></div>
          <div className="grid gap-3">
            {purchases.map((purchase, index) => {
              const total = purchaseTotal(purchase);
              const itemCountForPurchase = purchase.items.reduce((sum, item) => sum + item.quantity, 0);
              return (
                <details key={purchase.id} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" open={index === 0}>
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-4 marker:content-none">
                    <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-lg" aria-hidden="true">🧾</div>
                    <div className="min-w-0 flex-1"><p className="text-sm font-black">{dateFormatter.format(new Date(purchase.purchasedAt))}</p><p className="mt-0.5 text-xs font-semibold text-slate-500">{itemCountForPurchase}点・KAGO 広島店</p></div>
                    <p className="font-black text-emerald-800">{yen.format(total)}</p>
                    <span className="text-slate-400 transition group-open:rotate-180" aria-hidden="true">⌄</span>
                  </summary>
                  <div className="border-t border-slate-100 px-4 pb-4">
                    <div className="divide-y divide-slate-100">
                      {purchase.items.map((item) => {
                        const product = PRODUCT_BY_CODE[item.productCode];
                        if (!product) return null;
                        return (
                          <div key={item.productCode} className="flex items-center gap-3 py-3">
                            <div className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-emerald-50 text-2xl">
                              {MENU_PRODUCT_IMAGES[product.code] ? <Image src={MENU_PRODUCT_IMAGES[product.code]} alt="" fill sizes="44px" className="object-contain p-1" /> : <span aria-hidden="true">{productIcon(product)}</span>}
                            </div>
                            <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{product.name}</p><p className="text-xs text-slate-500">{yen.format(item.unitPrice)} × {item.quantity}</p></div>
                            <p className="text-sm font-black">{yen.format(item.unitPrice * item.quantity)}</p>
                          </div>
                        );
                      })}
                    </div>
                    <button type="button" onClick={() => addPurchaseAgain(purchase)} className="mt-2 min-h-12 w-full rounded-2xl bg-emerald-700 px-4 text-sm font-black text-white transition active:scale-[0.99]">
                      {addedOrderId === purchase.id ? "かごに追加しました ✓" : "この買い物をもう一度"}
                    </button>
                    {addedOrderId === purchase.id && <Link href="/App" className="mt-2 flex min-h-11 items-center justify-center rounded-2xl bg-slate-100 text-sm font-black text-slate-700">かごを確認する</Link>}
                  </div>
                </details>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="personalize-heading">
          <div className="mb-3 px-1"><p className="text-xs font-black text-emerald-700">PERSONALIZATION</p><h2 id="personalize-heading" className="text-xl font-black">おすすめ設定</h2></div>
          <div className="rounded-3xl border border-slate-200 bg-white px-5 shadow-sm">
            <SettingRow title="購入履歴を利用" description="購入周期やよく買う商品をおすすめに反映します" settingKey="usePurchaseHistory" value={settings.usePurchaseHistory} onChange={updateSetting} />
            <SettingRow title="いまのかごを利用" description="選んでいる商品と相性のよい商品を提案します" settingKey="useCurrentCart" value={settings.useCurrentCart} onChange={updateSetting} />
            <SettingRow title="おすすめ通知" description="買い忘れがありそうなときに通知します（デモ設定）" settingKey="recommendationNotifications" value={settings.recommendationNotifications} onChange={updateSetting} />
          </div>
          <p className="mt-3 px-2 text-xs font-semibold leading-5 text-slate-500">設定はこの端末に保存されます。テストユーザーのデータは架空で、実在する人物の情報ではありません。</p>
        </section>
      </div>
    </main>
  );
}
