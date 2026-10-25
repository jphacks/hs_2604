"use client";
import { useEffect,useRef,useState } from "react";
import { ShoppingIcon } from "@/components/shopping-icons";
import "./coupon-detail.css";

export function CouponArrival({name,discount,onOpen,onDismiss}:{name:string;discount:string;onOpen:()=>void;onDismiss:()=>void}){
 const [confirm,setConfirm]=useState(false);
 const cancel=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
   if(!confirm)return;
   const previous=document.activeElement as HTMLElement|null;
   cancel.current?.focus();
   const keyboard=(event:KeyboardEvent)=>{
     if(event.key==="Escape")setConfirm(false);
     if(event.key==="Tab"){
       const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>(".coupon-hide-dialog button"));
       if(event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons.at(-1)?.focus();}
       else if(!event.shiftKey&&document.activeElement===buttons.at(-1)){event.preventDefault();buttons[0]?.focus();}
     }
   };
   window.addEventListener("keydown",keyboard);
   return ()=>{window.removeEventListener("keydown",keyboard);previous?.focus();};
 },[confirm]);
 const hasOff=/OFF$/i.test(discount);
 const amount=hasOff?discount.replace(/OFF$/i,"").trim():discount;
 const display=/円$/.test(amount)?"¥"+amount.replace(/円$/,""):amount;
 return <>
   <div className="coupon-arrival coupon-arrival-guerrilla" inert={confirm}>
     <div className="coupon-ticket">
       <button type="button" className="coupon-ticket-main" onClick={onOpen} aria-label={"ゲリラクーポン："+name+" "+discount+"。詳細を開く"}>
         <ShoppingIcon name="coupon" className="coupon-ticket-icon"/>
         <span className="coupon-ticket-title">ゲリラ<br/>クーポン！</span>
         <strong className="coupon-ticket-value">{display}</strong>
         {hasOff&&<span className="coupon-ticket-off">OFF</span>}
       </button>
       <span className="coupon-ticket-perforation" aria-hidden="true"/>
       <button type="button" className="coupon-ticket-open" aria-label="クーポンを引っ込める" onClick={()=>setConfirm(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg></button>
     </div>
   </div>
   {confirm&&<div className="coupon-hide-overlay">
     <button type="button" className="coupon-hide-backdrop" tabIndex={-1} aria-label="確認を閉じる" onClick={()=>setConfirm(false)}/>
     <section role="alertdialog" aria-modal="true" aria-labelledby="coupon-hide-heading" aria-describedby="coupon-hide-description" className="coupon-hide-dialog">
       <span className="coupon-hide-symbol" aria-hidden="true"><ShoppingIcon name="coupon"/></span>
       <h2 id="coupon-hide-heading">クーポンを消しますか？</h2>
       <p id="coupon-hide-description">消すと、今回のお買い物では<br/>このクーポンを使えなくなります。</p>
       <button ref={cancel} type="button" className="coupon-hide-cancel" onClick={()=>setConfirm(false)}>消さずに戻る</button>
       <button type="button" className="coupon-hide-confirm" onClick={()=>{setConfirm(false);onDismiss();}}>クーポンを消す</button>
     </section>
   </div>}
 </>;
}
