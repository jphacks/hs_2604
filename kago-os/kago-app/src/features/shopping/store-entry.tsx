"use client";

import { AppBrandHeader } from "@/components/app-brand-header";
import { useState } from "react";
import { ShoppingIcon } from "@/components/shopping-icons";
import { BarcodeScanner } from "@/features/scanner/barcode-scanner";
import type { ShoppingContext } from "./service";
import "./store-entry.css";

type Props={
 context:ShoppingContext; qrStore:string|null; error:string;
 onDetected:(value:string)=>void; onClearQr:()=>void;
 onStart:(storeId:string,startNew:boolean,previousVisitId:string|null)=>void;
 onLogout:()=>void;
};
export function StoreEntry({context,qrStore,error,onDetected,onClearQr,onStart,onLogout}:Props){
 const [choice,setChoice]=useState<string|null>(null);
 const stores=[...context.stores].sort((a,b)=>Number(b.name==="広島デモ店"||b.branch_name==="広島デモ店")-Number(a.name==="広島デモ店"||a.branch_name==="広島デモ店"));
 const selected=qrStore??choice??context.activeVisits[0]?.store_id??stores[0]?.id;
 const active=context.activeVisits.find(visit=>visit.store_id===selected);
 const chosen=context.stores.find(store=>store.id===selected);
 const start=(startNew=false)=>{
   if(!chosen)return;
   if(startNew&&active&&!window.confirm("進行中の来店を終了し、空のかごで新しい買い物を始めます。よろしいですか？"))return;
   onStart(chosen.id,startNew,active?.id??null);
 };
 return <main className="store-entry">
   <AppBrandHeader/>
   <div className="store-entry-content">
     <div className="store-entry-title"><h1>お買い物の店舗を選ぶ</h1></div>
     <BarcodeScanner purpose="store" appearance="store" onDetected={onDetected}/>
     <p className="store-entry-help">カメラを利用できない場合は、スマートフォンのカメラでQRを開くか、下の店舗選択をご利用ください。</p>
     {/* #166：エラーは並びを崩さないよう、画面の上に重ねて出す */}
     {error&&<div role="alert" className="scanner-toast store-entry-toast"><p>{error}</p></div>}

     <section className="store-entry-options" aria-labelledby="entry-stores-heading">
       <h2 id="entry-stores-heading">デモ用の店舗を選択</h2>
       <div className="store-entry-chips">{stores.map(store=><button key={store.id} type="button" aria-pressed={selected===store.id} onClick={()=>{setChoice(store.id);if(qrStore)onClearQr();}}>
         <ShoppingIcon name="store"/><span>{store.branch_name||store.name}</span>{selected===store.id&&<span className="store-entry-check" aria-hidden="true">✓</span>}
       </button>)}</div>
       {context.stores.length===0&&<p className="store-entry-help">利用できる店舗がありません。店舗の登録をお待ちください。</p>}
     </section>
     {chosen&&<div className="store-entry-actions">
       <button type="button" className="store-entry-resume" onClick={()=>start()}><ShoppingIcon name={active?"history":"store"}/><span>{active?"前回の店舗から再開":"この店舗で買い物を始める"}</span><ShoppingIcon name="arrow"/></button>

     </div>}
     <details className="store-entry-extra"><summary>その他の操作</summary>{active&&<button type="button" className="store-entry-new" onClick={()=>start(true)}>空のかごで新しく来店する</button>}<button type="button" className="store-entry-logout" onClick={onLogout}>ログアウト</button></details>
   </div>
 </main>;
}
