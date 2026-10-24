"use client";
import { useEffect,useEffectEvent,useRef,useState } from "react";
import { BarcodeScanner } from "@/features/scanner/barcode-scanner";
import { cartRequest } from "@/features/cart/cart-provider";
import { cartMessages,type StoreProduct } from "@/features/cart/contracts";
import { useShoppingSession } from "@/features/shopping/session-provider";
import "./product-scan-dialog.css";

export function ProductScanDialog({product,disabled,onVerified,onClose}:{product:Pick<StoreProduct,"productId"|"name">;disabled:boolean;onVerified:()=>void;onClose:()=>void}){
 const session=useShoppingSession();
 const [code,setCode]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const request=useRef<AbortController|null>(null),intent=useRef<{code:string;id:string}|null>(null),locked=useRef(false);
 const close=useRef<HTMLButtonElement>(null);
 const closeDialog=useEffectEvent(onClose);
 useEffect(()=>{
   const previous=document.activeElement as HTMLElement|null;close.current?.focus();
   const keyboard=(event:KeyboardEvent)=>{
     if(event.key==="Escape"){event.stopImmediatePropagation();closeDialog();}
     if(event.key==="Tab"){
       const dialog=close.current?.closest("section");
       const controls=Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),summary')??[]);
       if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus();}
       if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus();}
     }
   };
   window.addEventListener("keydown",keyboard,true);
   return()=>{request.current?.abort();window.removeEventListener("keydown",keyboard,true);previous?.focus();};
 },[]);
 const verify=async(value:string)=>{
   if(disabled||locked.current||!value.trim())return;
   locked.current=true;setBusy(true);setError("");
   const controller=new AbortController();request.current=controller;
   const entered=value.trim();if(intent.current?.code!==entered)intent.current={code:entered,id:crypto.randomUUID()};
   try{
     const data:{product:StoreProduct}=await cartRequest("/api/cart",{action:"lookup",visitId:session.visit!.id,code:entered,requestId:intent.current.id},controller.signal);
     if(controller.signal.aborted)return;
     if(data.product.productId!==product.productId){setError("選んだ商品と違います。「"+product.name+"」のバーコードを読み取ってください。");return;}
     onVerified();onClose();
   }catch(failure){if(!controller.signal.aborted)setError(cartMessages[(failure as {code?:string}).code??""]??"商品を確認できませんでした。もう一度お試しください。");}
   finally{locked.current=false;if(!controller.signal.aborted)setBusy(false);}
 };
 return <div className="target-scan-overlay"><button type="button" tabIndex={-1} className="target-scan-backdrop" aria-label="読み取りを閉じる" onClick={onClose}/>
   <section role="dialog" aria-modal="true" aria-labelledby="target-scan-heading" className="target-scan-sheet">
     <header><div><p>商品を手元にご用意ください</p><h2 id="target-scan-heading">{product.name}を読み取る</h2></div><button ref={close} type="button" onClick={onClose} aria-label="読み取りを閉じる">×</button></header>
     <div className="target-scan-camera"><BarcodeScanner appearance="shopping" disabled={disabled||busy} onDetected={value=>{setCode(value);void verify(value);}} description="選んだ商品のバーコードを読み取ると、かごに追加します。"/></div>
     <p className="target-scan-help">商品を画面で選ぶだけでは、かごに追加されません。</p>
     {error&&<p role="alert" className="target-scan-error">{error}</p>}
     <details><summary>カメラが使えないとき</summary><form onSubmit={event=>{event.preventDefault();void verify(code);}}><label>商品のバーコード番号<input value={code} onChange={event=>setCode(event.target.value)} maxLength={100} required disabled={busy} autoComplete="off" inputMode="numeric"/></label><button type="submit" disabled={disabled||busy||!code.trim()}>{busy?"確認しています…":"番号を確認して追加"}</button></form></details>
   </section>
 </div>;
}
