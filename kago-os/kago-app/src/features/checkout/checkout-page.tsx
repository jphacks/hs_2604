"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { offerKindLabel } from "../offers/contracts";
import { checkoutMessages, isCheckoutIntent, type CheckoutContext, type CheckoutIntent } from "./contracts";

const yen=new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY"});
const date=new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",dateStyle:"medium",timeStyle:"short"});
type State={kind:"loading"}|{kind:"error";message:string}|{kind:"loaded";data:CheckoutContext};
const button="min-h-12 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white disabled:opacity-40";

async function checkoutRequest(signal:AbortSignal, body?:CheckoutIntent, visitId?:string):Promise<CheckoutContext> {
  const response=await fetch(`/api/checkout${visitId?`?visitId=${encodeURIComponent(visitId)}`:""}`,{
    method:body?"POST":"GET",credentials:"same-origin",cache:"no-store",
    headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined,
    signal:AbortSignal.any([signal,AbortSignal.timeout(20_000)]),
  });
  const data=await response.json(); if(!response.ok) throw {code:data.code,status:response.status}; return data;
}
const explain=(error:unknown)=>(checkoutMessages[(error as {code?:string})?.code??""]??checkoutMessages.connection_failed);

export function CheckoutPage() {
  const [state,setState]=useState<State>({kind:"loading"});
  const [busy,setBusy]=useState(false),[pending,setPending]=useState<CheckoutIntent|null>(null),[notice,setNotice]=useState("");
  const intent=useRef<CheckoutIntent|null>(null),locked=useRef(false),serial=useRef(0),active=useRef<AbortController|null>(null);
  const channel=useRef<BroadcastChannel|null>(null);
  const storageKey=(userId:string)=>`kago-checkout-pending:${userId}`;
  const clearIntent=(userId:string)=>{
    try {sessionStorage.removeItem(storageKey(userId));} catch { /* A confirmed receipt remains authoritative even if cleanup fails. */ }
    intent.current=null;setPending(null);
  };
  const accept=(data:CheckoutContext)=>{
    if(data.state==="complete") {
      clearIntent(data.userId);
      // Pin the completed visit so reloading still shows its receipt after another tab starts a new visit.
      const url=new URL(window.location.href);url.searchParams.set("visitId",data.receipt.visitId);window.history.replaceState(null,"",url);
    }
    setState({kind:"loaded",data});
  };
  const load=async()=>{
    if(locked.current) return;
    locked.current=true;setBusy(true);setState({kind:"loading"});
    const current=++serial.current;active.current?.abort();const controller=new AbortController();active.current=controller;
    const valid=()=>current===serial.current&&!controller.signal.aborted;
    try {
      let data=await checkoutRequest(controller.signal,undefined,new URL(window.location.href).searchParams.get("visitId")??undefined);
      if(!valid())return;
      let saved:CheckoutIntent|null=null;
      try {const value=JSON.parse(sessionStorage.getItem(storageKey(data.userId))??"null");if(isCheckoutIntent(value)&&value.userId===data.userId)saved=value;} catch { /* Invalid local data is never posted. */ }
      intent.current=saved;setPending(saved);
      if(saved) {
        const visit=data.state==="review"?data.quote.visitId:data.state==="complete"?data.receipt.visitId:null;
        if(visit!==saved.visitId) data=await checkoutRequest(controller.signal,undefined,saved.visitId);
      }
      if(valid()) accept(data);
    } catch(error) {if(valid())setState({kind:"error",message:explain(error)});}
    finally {if(valid()){locked.current=false;setBusy(false);}}
  };
  const submit=async()=>{
    if(locked.current||state.kind!=="loaded"||state.data.state!=="review")return;
    const quote=state.data.quote;
    let operation=intent.current;
    if(!operation) {
      if(!quote.canCheckout)return;
      operation={userId:quote.userId,visitId:quote.visitId,requestId:crypto.randomUUID(),expectedVersion:quote.cartVersion,expectedTotal:quote.total};
      try {sessionStorage.setItem(storageKey(quote.userId),JSON.stringify(operation));}
      catch {setNotice(checkoutMessages.storage_unavailable);return;}
      intent.current=operation;setPending(operation);
    }
    locked.current=true;setBusy(true);setNotice("");
    const current=++serial.current;active.current?.abort();const controller=new AbortController();active.current=controller;
    const valid=()=>current===serial.current&&!controller.signal.aborted;
    try {
      const data=await checkoutRequest(controller.signal,operation);
      if(!valid())return;
      if(data.userId!==operation.userId||data.state!=="complete"||data.receipt.visitId!==operation.visitId||data.receipt.total!==operation.expectedTotal)throw {code:"connection_failed"};
      accept(data);channel.current?.postMessage("visit_changed");
    } catch(error) {
      if(!valid())return;
      const code=(error as {code?:string})?.code??"connection_failed";
      if(["unauthenticated","session_expired","forbidden"].includes(code)) {setState({kind:"error",message:explain(error)});}
      else if(["price_changed","cart_changed","checkout_unavailable","checkout_conflict","invalid_request"].includes(code)) {
        clearIntent(operation.userId);
        try {
          const latest=await checkoutRequest(controller.signal,undefined,operation.visitId);
          if(valid()){accept(latest);setNotice(latest.state==="complete"?"この来店の疑似購入は確定済みです。":explain(error));}
        } catch(failure) {if(valid())setState({kind:"error",message:explain(failure)});}
      } else setNotice(explain(error));
    } finally {if(valid()){locked.current=false;setBusy(false);}}
  };
  useEffect(()=>{
    const generation=serial;
    const boot=window.setTimeout(()=>{void load();},0);
    const recheck=()=>{if(!document.hidden&&!locked.current)void load();};
    const changed=()=>{
      ++serial.current;active.current?.abort();locked.current=false;intent.current=null;setPending(null);setNotice("");void load();
    };
    if(typeof BroadcastChannel!=="undefined") {channel.current=new BroadcastChannel("kago-shopping-session");channel.current.onmessage=changed;}
    window.addEventListener("online",recheck);document.addEventListener("visibilitychange",recheck);
    return()=>{++generation.current;active.current?.abort();window.clearTimeout(boot);channel.current?.close();window.removeEventListener("online",recheck);document.removeEventListener("visibilitychange",recheck);};
    // The dedicated checkout page owns its identity boundary; it does not require an active shopping visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  const data=state.kind==="loaded"?state.data:null;
  const quote=data?.state==="review"?data.quote:null,receipt=data?.state==="complete"?data.receipt:null;
  return <main className="min-h-screen bg-[#f4f7f5] px-4 py-8 text-slate-950">
    <div className="mx-auto max-w-xl">
      <p className="text-xs font-black tracking-widest text-emerald-700">KAGO/APP</p>
      <h1 className="mt-2 text-2xl font-black">{receipt?"疑似購入が完了しました":"疑似購入の確認"}</h1>
      <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">デモ用の疑似購入です。実際の支払い・カード決済は発生しません。</p>
      {notice&&<p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-white p-4 text-sm">{notice}</p>}
      {state.kind==="loading"&&<p role="status" className="py-8">購入内容と保存結果を確認しています…</p>}
      {state.kind==="error"&&<div role="alert" className="mt-5 rounded-2xl bg-white p-5"><p>{state.message}</p><button type="button" onClick={()=>{void load();}} className={`${button} mt-4`}>購入結果を再確認</button></div>}
      {data?.state==="no_visit"&&<p className="mt-5 rounded-2xl bg-white p-5">購入できる来店がありません。買い物画面から店舗・来店を選んでください。</p>}
      {quote&&<>
        <p className="mt-5 text-sm font-bold">{quote.storeName}</p>
        <Summary subtotal={quote.subtotal} discountTotal={quote.discountTotal} total={quote.total} lines={quote.lines.map(line=>({productId:line.productId,name:line.name,unitPrice:line.price,quantity:line.quantity,discount:line.discount??0,available:line.available,discountLabel:line.offerKind?offerKindLabel[line.offerKind]:undefined}))}/>
        {pending?<div className="mt-4 rounded-2xl border border-amber-200 bg-white p-4 text-sm"><p>結果が未確認の購入操作があります。再試行では同じ操作を送り、注文を重ねて作りません。</p><p className="mt-2 font-bold">確定時に確認した金額：{yen.format(pending.expectedTotal)}</p></div>:!quote.canCheckout&&<p role="alert" className="mt-4 text-sm text-red-800">{quote.lines.length?"取扱停止の商品があります。かごで取り除いてください。":"かごが空のため購入できません。"}</p>}
        <button type="button" disabled={busy||(!pending&&!quote.canCheckout)} onClick={()=>{void submit();}} className={`${button} mt-5 w-full`}>{busy?"購入結果を確認しています…":pending?"同じ購入操作を再試行":"この内容で疑似購入を確定"}</button>
        {pending&&<button type="button" disabled={busy} onClick={()=>{void load();}} className="mt-2 min-h-11 w-full text-sm font-bold text-emerald-800 underline">購入結果を確認</button>}
      </>}
      {receipt&&<>
        <div role="status" className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950"><p className="font-black">注文を保存し、この来店を終了しました。</p><p className="mt-2">{receipt.storeName}・{date.format(new Date(receipt.orderedAt))}</p><p className="mt-1 break-all text-xs">注文番号：{receipt.orderId}</p></div>
        <Summary {...receipt}/>
        <p className="mt-4 text-sm leading-6 text-slate-600">次回来店のマイページで購入履歴を確認できます。履歴のおすすめ利用がONの場合は、次回のおすすめにも使われます。</p>
        <Link href="/App" className={`${button} mt-5 block text-center`}>次の買い物へ</Link>
      </>}
      {!receipt&&<Link href="/App" className="mt-5 block py-3 text-center text-sm font-bold text-emerald-800 underline">買い物画面へ戻る</Link>}
    </div>
  </main>;
}
function Summary({lines,subtotal,discountTotal,total}:{lines:{productId:string;name:string;unitPrice:number;quantity:number;discount:number;available?:boolean;discountLabel?:string}[];subtotal:number;discountTotal:number;total:number}) {
  return <section aria-label="購入明細" className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
    <ul className="divide-y divide-slate-100">{lines.map(line=><li key={line.productId} className="py-3">
      <div className="flex justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-sm font-bold">{line.name}</h2><p className="mt-1 text-xs text-slate-500">{yen.format(line.unitPrice)} × {line.quantity}点</p></div><p className="shrink-0 text-sm font-bold">{yen.format(line.unitPrice*line.quantity-line.discount)}</p></div>
      {line.discount>0&&<p className="mt-2 text-xs font-bold text-pink-700">{line.discountLabel??"クーポン・セール割引"} −{yen.format(line.discount)}</p>}
      {line.available===false&&<p className="mt-2 text-xs font-bold text-red-700">取扱停止中</p>}
    </li>)}</ul>
    <dl className="mt-3 grid gap-2 border-t border-slate-200 pt-4 text-sm"><div className="flex justify-between"><dt>小計</dt><dd>{yen.format(subtotal)}</dd></div>{discountTotal>0&&<div className="flex justify-between font-bold text-pink-700"><dt>クーポン・セール割引</dt><dd>−{yen.format(discountTotal)}</dd></div>}<div className="flex justify-between text-lg font-black"><dt>購入合計</dt><dd>{yen.format(total)}</dd></div></dl>
  </section>;
}
