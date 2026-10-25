"use client";

import Link from "next/link";
import Image from "next/image";
import { AppBrandHeader } from "@/components/app-brand-header";
import { ShoppingIcon } from "@/components/shopping-icons";
import { MENU_PRODUCT_IMAGES } from "@/lib/product-visuals";
import "./checkout.css";
import { useEffect, useRef, useState } from "react";
import { offerKindLabel } from "../offers/contracts";
import { checkoutMessages, isCheckoutIntent, type CheckoutContext, type CheckoutIntent } from "./contracts";

const yen=new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY"});
const date=new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",dateStyle:"medium",timeStyle:"short"});
type State={kind:"loading"}|{kind:"error";message:string}|{kind:"loaded";data:CheckoutContext};

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

  return <main className="checkout-preview checkout-live">
    <AppBrandHeader/>
    <div className="checkout-preview-heading"><h1>{receipt?"お買い物が完了しました":"お会計の確認"}</h1><p>{receipt?"ご利用ありがとうございました。":"商品と金額をご確認ください"}</p></div>
    <div className="checkout-preview-content">
      <p className="checkout-demo-notice">デモ用の疑似購入です。実際の支払い・カード決済は発生しません。</p>
      {notice&&<p role="alert" className="checkout-live-notice">{notice}</p>}
      {state.kind==="loading"&&<p role="status" className="checkout-live-notice">購入内容と保存結果を確認しています…</p>}
      {state.kind==="error"&&<div role="alert" className="checkout-live-notice"><p>{state.message}</p><button type="button" onClick={()=>{void load();}} className="checkout-preview-primary">購入結果を再確認</button></div>}
      {data?.state==="no_visit"&&<p className="checkout-live-notice">購入できる来店がありません。買い物画面から店舗・来店を選んでください。</p>}
      {quote&&<>
        <div className="checkout-preview-store"><ShoppingIcon name="store"/><span>{quote.storeName}</span><small>{quote.lines.reduce((n,line)=>n+line.quantity,0)}点</small></div>
        <Summary subtotal={quote.subtotal} discountTotal={quote.discountTotal} total={quote.total} lines={quote.lines.map(line=>({productId:line.productId,code:line.code,name:line.name,unitPrice:line.price,quantity:line.quantity,discount:line.discount??0,available:line.available,discountLabel:line.offerKind?offerKindLabel[line.offerKind]:undefined}))}/>
        {quote.discountTotal>0&&<div className="checkout-preview-discount"><ShoppingIcon name="coupon"/><span>クーポン・セール割引</span><strong>−{yen.format(quote.discountTotal)}</strong></div>}
        {pending?<div className="checkout-live-notice"><p>結果が未確認の購入操作があります。再試行では同じ操作を送り、注文を重ねて作りません。</p><p>確定時に確認した金額：{yen.format(pending.expectedTotal)}</p></div>:!quote.canCheckout&&<p role="alert" className="checkout-live-notice">{quote.lines.length?"取扱停止の商品があります。かごで取り除いてください。":"かごが空のため購入できません。"}</p>}
      </>}
      {receipt&&<>
        <div className="checkout-live-success" role="status"><span aria-hidden="true">✓</span><p>注文を保存し、この来店を終了しました。</p></div>
        <div className="checkout-preview-store"><ShoppingIcon name="store"/><span>{receipt.storeName}</span><small>{receipt.lines.reduce((n,line)=>n+line.quantity,0)}点</small></div>
        <p className="checkout-live-receipt-meta">{date.format(new Date(receipt.orderedAt))}<br/>注文番号：{receipt.orderId}</p>
        <Summary {...receipt}/>
        <p className="checkout-live-receipt-meta">次のお買い物で購入履歴を確認できます。</p>
      </>}
    </div>
    <footer className="checkout-preview-footer">
      {(quote||receipt)&&<><div className="checkout-preview-subtotal"><span>商品合計</span><span>{yen.format((quote??receipt)!.subtotal)}</span></div>{(quote??receipt)!.discountTotal>0&&<div className="checkout-preview-subtotal"><span>クーポン・セール割引</span><span>−{yen.format((quote??receipt)!.discountTotal)}</span></div>}<div className="checkout-preview-total"><span>{receipt?"合計":"お支払い合計"}</span><strong>{yen.format((quote??receipt)!.total)}</strong></div></>}
      {quote&&<><button type="button" disabled={busy||(!pending&&!quote.canCheckout)} onClick={()=>{void submit();}} className="checkout-preview-primary">{busy?"購入結果を確認しています…":pending?"同じ購入操作を再試行":"お会計を確定する"}</button>{pending&&<button type="button" disabled={busy} onClick={()=>{void load();}} className="checkout-preview-secondary">購入結果を確認</button>}</>}
      <Link href={receipt?"/App":"/App?cart=open"} className={receipt?"checkout-preview-primary":"checkout-preview-secondary"}>{receipt?"次の買い物へ":"買い物かごに戻る"}</Link>
    </footer>
  </main>;
}
function Summary({lines}:{lines:{productId:string;code?:string;name:string;unitPrice:number;quantity:number;discount:number;available?:boolean;discountLabel?:string}[];subtotal:number;discountTotal:number;total:number}){
  return <section className="checkout-preview-items" aria-label="購入明細"><ul>{lines.map(line=><li key={line.productId} className="checkout-preview-line">
    {line.code&&MENU_PRODUCT_IMAGES[line.code]&&<div className="checkout-preview-photo"><Image src={MENU_PRODUCT_IMAGES[line.code]} alt="" fill sizes="60px"/></div>}
    <div className="checkout-live-line-copy"><h2>{line.name}</h2><p>{yen.format(line.unitPrice)} × {line.quantity}点</p>{line.discount>0&&<p className="checkout-live-line-discount">{line.discountLabel??"クーポン・セール割引"} −{yen.format(line.discount)}</p>}{line.available===false&&<p className="checkout-live-line-discount">取扱停止中</p>}</div><strong>{yen.format(line.unitPrice*line.quantity-line.discount)}</strong>
  </li>)}</ul></section>;
}
