"use client";

import Image from "next/image";
import {SponsoredArtwork} from "./sponsored-artwork";
import {useEffect,useEffectEvent,useRef,type ReactNode,type Ref} from "react";
import { ShoppingIcon } from "@/components/shopping-icons";
import { MENU_PRODUCT_IMAGES, productIcon } from "@/lib/product-visuals";
import type { SavedSelectionItem } from "./selection-contracts";
import "./suggestion-detail.css";

type Props={item:SavedSelectionItem;label:string;added:boolean;disabled:boolean;onClose:()=>void;onAdd:()=>void;closeButtonRef?:Ref<HTMLButtonElement>;previewControls?:ReactNode;scanRequired?:boolean};
const yen=new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY"});
export function SuggestionDetail({item,label,added,disabled,onClose,onAdd,closeButtonRef,previewControls,scanRequired=false}:Props){
 const sheet=useRef<HTMLElement>(null);const closeDialog=useEffectEvent(onClose);
 useEffect(()=>{
  if(closeButtonRef)return;
  const previous=document.activeElement as HTMLElement|null;
  sheet.current?.querySelector<HTMLElement>("button")?.focus();
  const keyboard=(event:KeyboardEvent)=>{
   if(document.querySelector(".target-scan-overlay"))return;
   if(event.key==="Escape"){event.preventDefault();closeDialog();}
   if(event.key==="Tab"){
    const controls=Array.from(sheet.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]')??[]);
    if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus();}
    if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus();}
   }
  };
  window.addEventListener("keydown",keyboard);
  return()=>{window.removeEventListener("keydown",keyboard);previous?.focus();};
 },[closeButtonRef]);
 const image=MENU_PRODUCT_IMAGES[item.product.code];
 return <div className="suggestion-detail-overlay">
   <button type="button" tabIndex={-1} className="suggestion-detail-backdrop" onClick={onClose} aria-label="詳細を閉じる"/>
   <div className="suggestion-detail-group">
   {previewControls}
   <section ref={sheet} role="dialog" aria-modal="true" aria-labelledby="suggestion-detail-heading" className="suggestion-detail-sheet">
     <div className="suggestion-detail-handle" aria-hidden="true"/>
     <header className="suggestion-detail-header"><span className={"suggestion-detail-badge suggestion-detail-badge-"+item.placementType}>{label}</span><button ref={closeButtonRef} type="button" onClick={onClose} aria-label="閉じる">×</button></header>
     <div className="suggestion-detail-scroll">
       <div className="suggestion-detail-photo" aria-hidden="true">{item.sponsor?<SponsoredArtwork versionId={item.sponsor.creativeVersionId} sizes="(max-width:520px) 85vw,420px" fallback={image?<Image src={image} alt="" fill sizes="(max-width:520px) 85vw,420px"/>:<span>{productIcon(item.product)}</span>}/>:image?<Image src={image} alt="" fill sizes="(max-width:520px) 85vw,420px"/>:<span>{productIcon(item.product)}</span>}</div>
       <div className="suggestion-detail-info"><p>{item.product.category}</p><h2 id="suggestion-detail-heading">{item.product.name}</h2><strong>{yen.format(item.product.price)}</strong></div>
       <div className="suggestion-detail-copy">
       {item.sponsor&&<div className="suggestion-detail-sponsor"><strong>{item.sponsor.headline}</strong><p>広告提供：{item.sponsor.makerName}</p></div>}
       {item.placementType==="store_promo"&&<p className="suggestion-detail-store-note"><ShoppingIcon name="store"/>店舗が選んだおすすめ商品です。</p>}
       <div className="suggestion-detail-reason"><h3><ShoppingIcon name="heart"/>おすすめの理由</h3><p>{item.reasonText}</p></div>
       </div>
     </div>
     <footer className="suggestion-detail-footer"><button type="button" disabled={disabled||added} onClick={onAdd}><ShoppingIcon name={scanRequired?"camera":"cart"}/>{scanRequired?"商品のバーコードを読み取る":added?"かごに追加済み":"かごに追加"}</button></footer>
   </section>
   </div>
 </div>;
}
