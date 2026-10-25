"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ShoppingIcon } from "@/components/shopping-icons";
import { useShoppingSession } from "../shopping/session-provider";
import { usePersonalization } from "../recommendations/personalization-provider";
import { accountRequest, accountFailureMessage, isAccountAuthFailure } from "./client";
import type { AccountScope, PurchaseHistory, PurchaseOrder } from "./contracts";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });
const date = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" });

export function PurchaseHistorySection() {
  const session = useShoppingSession();
  const { settings } = usePersonalization();
  const [selectedStore,setSelectedStore]=useState("all");
  const [period,setPeriod]=useState<"all"|"week"|"month">("all");
  const [now]=useState(()=>Date.now());
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
      const data: PurchaseHistory & { scope: AccountScope } = await accountRequest(`/api/account?history=1&store=${encodeURIComponent(selectedStore)}${next ? `&cursor=${encodeURIComponent(next)}` : ""}`, undefined, controller.signal);
      if (controller.signal.aborted) return;
      if (data.scope.userId !== session.userId || data.scope.visitId !== session.visit!.id) throw { code: "visit_unavailable" };
      setOrders(previous => next ? [...previous, ...data.orders] : data.orders); setCursor(data.nextCursor); setLoaded(true);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (isAccountAuthFailure(failure)) session.revalidate(); else setError(accountFailureMessage(failure));
    } finally { if (!controller.signal.aborted) setLoading(false); }
  };
  useEffect(() => {
    const boot = window.setTimeout(() => { setOrders([]); setCursor(null); setLoaded(false); void load(); }, 0);
    return () => { window.clearTimeout(boot); active.current?.abort(); };
    // The session provider owns the identity/visit boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStore]);


  const store=session.stores.find(item=>item.id===session.visit?.store_id);
  const storeName=[store?.name,store?.branch_name].filter(Boolean).join(" ");
  const localNow=new Date(now+9*60*60*1000);
  const weekStart=Date.UTC(localNow.getUTCFullYear(),localNow.getUTCMonth(),localNow.getUTCDate()-(localNow.getUTCDay()+6)%7)-9*60*60*1000;
  const monthStart=Date.UTC(localNow.getUTCFullYear(),localNow.getUTCMonth(),1)-9*60*60*1000;
  const visible=orders.filter(order=>period==="all"||new Date(order.orderedAt).getTime()>=(period==="week"?weekStart:monthStart));
  const monthFormat=new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"long"});

  return <section aria-labelledby="history-heading">
    <div className="account-title"><h1 id="history-heading">購入履歴</h1><p>これまでのお買い物を確認できます</p></div>
    <details className="account-store-picker">
      <summary><ShoppingIcon name="store"/><span>{selectedStore==="all"?"すべての店舗":session.stores.find(item=>item.id===selectedStore)?.branch_name||session.stores.find(item=>item.id===selectedStore)?.name||"店舗を選択"}</span><ShoppingIcon name="arrow"/></summary>
      <div className="account-store-options" role="group" aria-label="購入履歴の店舗">
        {[{id:"all",name:"すべての店舗",branch_name:""},...session.stores].map(item=><button key={item.id} type="button" aria-pressed={selectedStore===item.id} onClick={event=>{setSelectedStore(item.id);const picker=event.currentTarget.closest("details");if(picker)picker.open=false;}}>
          <ShoppingIcon name="store"/><span>{[item.name,item.branch_name].filter(Boolean).join(" ")}</span><span className="account-store-check" aria-hidden="true">{selectedStore===item.id?"✓":""}</span>
        </button>)}
      </div>
    </details>
    <div className="account-periods" aria-label="購入履歴の期間">
      {([["all","すべて"],["week","今週"],["month","今月"]] as const).map(([value,label])=><button key={value} type="button" aria-pressed={period===value} onClick={()=>setPeriod(value)}>{label}</button>)}
    </div>
    {settings&&!settings.usePurchaseHistory&&<div className="account-history-off"><span>履歴のおすすめ利用はOFFです。</span><Link href="/App/account#preferences-heading">設定はこちら<ShoppingIcon name="arrow"/></Link></div>}
    {error&&<div role="alert" className="account-note account-note-error"><p>{error}</p><button type="button" onClick={()=>{void load(retryCursor.current);}} className="account-retry">購入履歴を再試行</button></div>}
    {loaded&&!loading&&!error&&visible.length===0&&<p className="account-note">{orders.length===0?"この店舗での購入履歴はまだありません。":"表示中の記録には、この期間の購入がありません。以前の購入も読み込めます。"}</p>}
    <div className="account-order-list">
      {visible.map((order,index)=>{
        const orderStore=session.stores.find(item=>item.id===order.storeId);
        const orderStoreName=orderStore?[orderStore.name,orderStore.branch_name].filter(Boolean).join(" "):order.storeId?"過去に利用した店舗":storeName;
        const month=monthFormat.format(new Date(order.orderedAt));
        const subtotal=order.items.reduce((sum,item)=>sum+item.unitPrice*item.quantity,0);
        return <div key={order.id}>
          {(index===0||month!==monthFormat.format(new Date(visible[index-1].orderedAt)))&&<h2 className="account-month">{month}</h2>}
          <article className="account-order" aria-label={date.format(new Date(order.orderedAt))+"の購入"}>
            <div className="account-order-top"><ShoppingIcon name="store"/><div><h3>{orderStoreName}</h3><time dateTime={order.orderedAt}>{date.format(new Date(order.orderedAt))}</time></div><strong>{yen.format(order.total)}</strong></div>
            <div className="account-order-bottom"><span>{order.items.reduce((sum,item)=>sum+item.quantity,0)}点のお買い物</span>{order.dataOrigin!=="operated"&&<span className="account-origin">デモの購入記録</span>}</div>
            <details className="account-receipt">
              <summary><span className="account-receipt-open">詳細を見る</span><span className="account-receipt-close">詳細を閉じる</span><ShoppingIcon name="arrow"/></summary>
              <ul>{order.items.map(item=><li key={item.productId}><div><strong>{item.name}</strong><small>{yen.format(item.unitPrice)} × {item.quantity}点</small></div><span>{yen.format(item.unitPrice*item.quantity)}</span></li>)}</ul>
              {subtotal>order.total&&<p className="account-receipt-saving"><span>クーポン・セール割引</span><span>−{yen.format(subtotal-order.total)}</span></p>}
              <p className="account-receipt-total"><span>購入合計</span><span>{yen.format(order.total)}</span></p>
            </details>
          </article>
        </div>;
      })}
    </div>
    {loading&&<p role="status" className="account-note">購入履歴を読み込んでいます…</p>}
    {cursor&&!error&&<button type="button" disabled={loading} onClick={()=>{void load(cursor);}} className="account-more">以前の購入を表示</button>}
  </section>;
}
