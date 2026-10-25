"use client";
import {useEffect,useEffectEvent,useRef,type ReactNode} from "react";
import {ShoppingIcon} from "@/components/shopping-icons";
import type {SerendipityOffer} from "./contracts";
import "./coupon-detail.css";
import "./store-offer-card.css";
const yen=new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY"});
const time=new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
export function StoreOfferDetail({offer,onClose,onScan,disabled=false,redemption}:{offer:SerendipityOffer;onClose:()=>void;onScan:()=>void;disabled?:boolean;redemption?:ReactNode}){
 const root=useRef<HTMLElement>(null);const closeDialog=useEffectEvent(onClose);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;root.current?.querySelector<HTMLButtonElement>("button")?.focus();const keys=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();closeDialog();return;}if(e.key!=="Tab")return;const controls=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),summary')??[]);if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0]?.focus();}};window.addEventListener("keydown",keys);return()=>{window.removeEventListener("keydown",keys);previous?.focus();};},[]);
 return <div className="store-offer-detail-overlay"><button type="button" tabIndex={-1} className="store-offer-detail-backdrop" aria-label="セールの詳細を閉じる" onClick={onClose}/><section ref={root} role="dialog" aria-modal="true" aria-label={offer.headline} className="store-offer-detail"><button type="button" className="store-offer-close" aria-label="閉じる" onClick={onClose}>×</button><span className="store-offer-label">{offer.kind==="set_deal"?"セット割":"タイムセール"}</span><h2>{offer.product.name}</h2>
 {!redemption?<><p className="store-offer-detail-price"><del>{yen.format(offer.product.price)}</del><strong>{yen.format(offer.product.price-offer.unitDiscount)}</strong></p><p>対象商品のバーコードを読み取ると、<br/>割引価格でかごに追加します。</p>{offer.trigger&&<p>{offer.trigger.name}と一緒に購入するとセット割になります。</p>}<p className="store-offer-detail-note">{time.format(new Date(offer.endsAt))}まで。終了後に追加した分は対象外です。</p><button type="button" disabled={disabled} className="coupon-detail-claim store-offer-read" onClick={onScan}><ShoppingIcon name="camera"/>ここから商品を読み取る</button></>:redemption}
 </section></div>;
}
