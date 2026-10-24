"use client";

import { useEffect, useRef, useState } from "react";
import { useShoppingSession } from "../shopping/session-provider";
import { usePersonalization } from "../recommendations/personalization-provider";
import { accountRequest, accountFailureMessage, isAccountAuthFailure } from "./client";
import type { AccountScope, PurchaseHistory, PurchaseOrder } from "./contracts";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });
const date = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" });

export function PurchaseHistorySection() {
  const session = useShoppingSession();
  const { settings } = usePersonalization();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const retryCursor = useRef<string | null>(null);

  const load = async (next: string | null = null) => {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    retryCursor.current = next; setLoading(true); setError("");
    try {
      const data: PurchaseHistory & { scope: AccountScope } = await accountRequest(`/api/account?history=1${next ? `&cursor=${encodeURIComponent(next)}` : ""}`, undefined, controller.signal);
      if (controller.signal.aborted) return;
      if (data.scope.userId !== session.userId || data.scope.visitId !== session.visit!.id) throw { code: "visit_unavailable" };
      setOrders(previous => next ? [...previous, ...data.orders] : data.orders); setCursor(data.nextCursor); setLoaded(true);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (isAccountAuthFailure(failure)) session.revalidate(); else setError(accountFailureMessage(failure));
    } finally { if (!controller.signal.aborted) setLoading(false); }
  };
  useEffect(() => {
    const boot = window.setTimeout(() => { void load(); }, 0);
    return () => { window.clearTimeout(boot); active.current?.abort(); };
    // The session provider owns the identity/visit boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <section aria-labelledby="history-heading" className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
    <p className="text-xs font-black tracking-wider text-emerald-700">PURCHASE HISTORY</p>
    <h2 id="history-heading" className="mt-1 text-xl font-black">この店舗での購入履歴</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">今回の来店より前の購入記録です。商品名と価格は購入時の内容です。</p>
    {settings && !settings.usePurchaseHistory && <p className="mt-3 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">履歴のおすすめ利用はOFFです。購入履歴はここで確認できます。</p>}
    {error && <div role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800"><p>{error}</p><button type="button" onClick={() => { void load(retryCursor.current); }} className="mt-2 min-h-11 font-bold underline">購入履歴を再試行</button></div>}
    {loaded && !loading && !error && orders.length === 0 && <p className="mt-5 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">この店舗での過去の購入履歴はまだありません。</p>}
    <div className="mt-4 grid gap-4">
      {orders.map(order => <article key={order.id} aria-label={`${date.format(new Date(order.orderedAt))}の購入`} className="overflow-hidden rounded-2xl border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50 px-4 py-3"><time dateTime={order.orderedAt} className="text-sm font-bold text-emerald-950">{date.format(new Date(order.orderedAt))}</time><span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-600">{order.dataOrigin==="operated"?"Appでの疑似購入":"デモの購入記録"}</span></div>
        <ul className="divide-y divide-slate-100 px-4">
          {order.items.map(item => <li key={item.productId} className="flex justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words text-sm font-semibold">{item.name}</p><p className="mt-1 text-xs text-slate-500">{yen.format(item.unitPrice)} × {item.quantity}点</p></div><p className="shrink-0 text-sm font-bold">{yen.format(item.unitPrice * item.quantity)}</p></li>)}
        </ul>
        {order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) > order.total && <p className="flex justify-between border-t border-slate-100 px-4 pt-3 text-sm font-bold text-pink-700"><span>クーポン・セール割引</span><span>−{yen.format(order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) - order.total)}</span></p>}
        <p className="flex justify-between border-t border-slate-100 px-4 py-3 text-sm font-black"><span>購入合計</span><span>{yen.format(order.total)}</span></p>
      </article>)}
    </div>
    {loading && <p role="status" className="py-5 text-sm text-slate-600">購入履歴を読み込んでいます…</p>}
    {cursor && !error && <button type="button" disabled={loading} onClick={() => { void load(cursor); }} className="mt-4 min-h-11 w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-800 disabled:opacity-40">以前の購入を表示</button>}
  </section>;
}
