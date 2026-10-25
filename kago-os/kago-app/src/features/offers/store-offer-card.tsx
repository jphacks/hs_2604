"use client";
import Image from "next/image";
import {useEffect,useState} from "react";
import {ShoppingIcon} from "@/components/shopping-icons";
import {MENU_PRODUCT_IMAGES,productIcon} from "@/lib/product-visuals";
import type {SerendipityOffer} from "./contracts";
import "./store-offer-card.css";
const yen=new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY"});
const clock=new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",hour:"2-digit",minute:"2-digit"});
export function StoreOfferCard({offer,serverTime,disabled=false,onUse}:{offer:SerendipityOffer;serverTime:string;disabled?:boolean;onUse:()=>void}){
 const [clockState,setClockState]=useState({serverTime,elapsed:0});
 const elapsed=clockState.serverTime===serverTime?clockState.elapsed:0;
 useEffect(()=>{const start=Date.now();const timer=setInterval(()=>setClockState({serverTime,elapsed:Date.now()-start}),1000);return()=>clearInterval(timer);},[serverTime]);
 const remaining=Math.max(0,Date.parse(offer.endsAt)-Date.parse(serverTime)-elapsed);
 const duration=Math.max(1,Date.parse(offer.endsAt)-Date.parse(offer.startsAt));
 const percent=offer.discountPercent;
 const image=MENU_PRODUCT_IMAGES[offer.product.code];
 return <div className="store-offer-card" aria-label={(offer.kind==="set_deal"?"セット割 ":"タイムセール ")+offer.headline}>
 <header><span className="store-offer-label"><ShoppingIcon name="history"/>{offer.kind==="set_deal"?"セット割":"タイムセール"}</span><span className="store-offer-time"><ShoppingIcon name="history"/>{clock.format(new Date(offer.startsAt))}–{clock.format(new Date(offer.endsAt))}</span></header>
 <div className="store-offer-main"><div className="store-offer-copy"><h2>{offer.product.name}</h2><p className="store-offer-discount"><strong>{percent??offer.unitDiscount}</strong><span>{percent!==null?"%OFF":"円引き"}</span></p><div className="store-offer-price"><del>{yen.format(offer.product.price)}</del><ShoppingIcon name="arrow"/><strong>{yen.format(offer.product.price-offer.unitDiscount)}</strong></div></div>
 <div className="store-offer-photo">{image?<Image src={image} alt="" fill sizes="220px"/>:<span className="store-offer-photo-icon" aria-hidden="true">{productIcon(offer.product)}</span>}<span className="store-offer-sparks" aria-hidden="true"><i/><i/><i/></span></div></div>
 <div className="store-offer-remaining"><span className="store-offer-progress" aria-hidden="true"><i style={{width:Math.min(100,remaining/duration*100)+"%"}}/></span><span>{remaining>0?"残り"+Math.ceil(remaining/60000)+"分":"終了しました"}</span></div>
 <button type="button" disabled={disabled||remaining===0} className="store-offer-scan" onClick={onUse}><ShoppingIcon name={offer.action==="apply"?"coupon":"camera"}/>{offer.action==="apply"?"かごの商品に割引を適用":"商品をスキャンして使う"}<ShoppingIcon name="arrow"/></button>
 </div>;
}
