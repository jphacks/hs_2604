"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cartRequest, useCart } from "@/features/cart/cart-provider";
import { useShoppingSession } from "@/features/shopping/session-provider";
import { MENU_PRODUCT_IMAGES, productIcon } from "@/lib/product-visuals";
import type { RegularReminderResponse } from "./reminders";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });
const day = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });

// #152: regular purchases due now, shown from the first moment of the visit (even with an empty cart).
// The list is read once per visit; products put into the cart disappear from it right away.
// Nothing is shown when history use is off, the request fails, or nothing is due: it is a helper, not a gate.
export function RegularReminders() {
  const cart = useCart();
  const session = useShoppingSession();
  const visitId = session.visit!.id;
  const [data, setData] = useState<RegularReminderResponse | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    cartRequest("/api/regular-purchases", undefined, controller.signal)
      .then((result: RegularReminderResponse) => { if (!controller.signal.aborted) setData(result); })
      .catch(() => { if (!controller.signal.aborted) setData(null); });
    return () => controller.abort();
  }, [visitId]);

  const inCart = new Set(cart.lines.map(line => line.productId));
  const items = data?.visitId === visitId ? data.items.filter(item => !inCart.has(item.product.productId)) : [];
  if (!items.length) return null;

  return <section aria-labelledby="regular-heading" className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
    <div className="flex items-end justify-between gap-2">
      <div><p className="text-xs font-black tracking-wider text-emerald-700">いつもの商品</p>
        <h2 id="regular-heading" className="text-xl font-black">そろそろ買う頃です</h2></div>
      <span className="shrink-0 text-[11px] text-slate-500">購入履歴から</span>
    </div>
    <ul className="mt-3 divide-y divide-slate-100">
      {items.map(item => {
        const image = MENU_PRODUCT_IMAGES[item.product.code];
        const overdue = item.status === "overdue";
        return <li key={item.product.productId} className="flex items-center gap-3 py-2.5">
          <div className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-emerald-50 text-2xl">
            {image ? <Image src={image} alt="" fill sizes="48px" className="object-cover" /> : <span aria-hidden="true">{productIcon(item.product)}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-bold">{item.product.name}</p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${overdue ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>
                {overdue ? "目安を過ぎています" : "そろそろ"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              約{Math.max(1, Math.round(item.intervalDays))}日ごと・前回 {day.format(new Date(item.lastPurchasedAt))}（{item.daysSinceLastPurchase}日前）
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs font-bold tabular-nums">{yen.format(item.product.price)}</p>
            <button type="button" disabled={!cart.canEdit} onClick={() => cart.addProduct(item.product)}
              aria-label={`いつもの${item.product.name}をかごに追加`}
              className="mt-1 min-h-9 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white disabled:opacity-40">追加</button>
          </div>
        </li>;
      })}
    </ul>
    <p className="mt-2 text-[11px] text-slate-500">
      購入間隔から計算した目安です。<Link href="/App/account" className="underline">マイページ</Link>で履歴の利用をOFFにできます。
    </p>
  </section>;
}
