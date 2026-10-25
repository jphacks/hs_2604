"use client";
import Image from "next/image";
import {useEffect,useRef,useState} from "react";
import {ShoppingIcon} from "@/components/shopping-icons";
import {StoreOfferCard} from "@/features/offers/store-offer-card";
import {StoreOfferDetail} from "@/features/offers/store-offer-detail";
import type {SerendipityOffer} from "@/features/offers/contracts";
import {BarcodeScanner} from "@/features/scanner/barcode-scanner";
import "@/app/globals.css";
import "@/components/app-brand-header.css";
import "@/app/App/shopping-home.css";
import "@/features/offers/coupon-detail.css";
import "./preview.css";

const categories=[["果物","/images/shopping/category-fruit.png"],["惣菜","/images/products/karaage.png"],["野菜","/images/shopping/category-vegetables.png"],["パン","/images/shopping/category-bread.png"]];
const sampleOffer:SerendipityOffer={offerId:"00000000-0000-4000-8000-000000000042",kind:"time_sale",headline:"お惣菜 20%OFF",discountPercent:20,discountAmount:null,unitDiscount:71,startsAt:"2026-10-25T07:32:00+09:00",endsAt:"2026-10-25T08:02:00+09:00",product:{productId:"00000000-0000-4000-8000-000000000033",code:"PLU-2002",name:"若鶏のからあげ",category:"惣菜",price:358,available:true},trigger:null,productInCart:false,triggerInCart:false,action:"add",reason:"いまだけの店内タイムセールです",discountLabel:"20% OFF",score:0,relation:null};
export function SalePreview(){
 const [active,setActive]=useState(0),[paused,setPaused]=useState(false),[hover,setHover]=useState(false),[details,setDetails]=useState(false);
 const touch=useRef(0),wheel=useRef(0);
 useEffect(()=>{if(paused||hover||details||matchMedia("(prefers-reduced-motion: reduce)").matches)return;const id=setInterval(()=>setActive(a=>1-a),5000);return()=>clearInterval(id);},[paused,hover,details]);
 return <main className="shopping-home sale-preview">
 <header className="shopping-header app-brand-header"><h1><Image src="/brand/light/logo-kago-app.png" alt="KAGO/App" width={2124} height={384} className="shopping-logo app-brand-logo" priority/></h1><div className="shopping-store"><span>ご利用店舗</span><strong>検証1号店</strong></div></header>
 <div className="shopping-content">
 <section aria-label="商品をスキャン"><BarcodeScanner appearance="shopping" onDetected={()=>{}}/></section>
 <form className="shopping-search" onSubmit={e=>e.preventDefault()}><ShoppingIcon name="search"/><input placeholder="商品を検索" aria-label="商品を検索"/><button type="submit" aria-label="検索"><ShoppingIcon name="search"/></button></form>
 <section className="shopping-categories" aria-label="カテゴリーから探す">{categories.map(([name,image])=><button type="button" key={name} className="shopping-category"><span className="shopping-category-photo"><Image src={image} alt="" fill sizes="50px"/></span><strong>{name}</strong></button>)}</section>
 <section className="shopping-card-stack" aria-label="タイムセールと広告の見本">
 <div className="shopping-stack-viewport" tabIndex={0} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} onFocusCapture={()=>setHover(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setHover(false);}}
 onWheel={e=>{if(Math.abs(e.deltaY)>8&&Date.now()-wheel.current>650){wheel.current=Date.now();setActive(a=>1-a);}}}
 onPointerDown={e=>{touch.current=e.clientY;}} onPointerUp={e=>{if(Math.abs(e.clientY-touch.current)>28)setActive(a=>1-a);}}
 onKeyDown={e=>{if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();setActive(a=>1-a);}}}>
 <article className="sale-stack-card" aria-hidden={active!==0} inert={active!==0} style={{transform:active===0?"translateY(0)":"translateY(104%)"}}><StoreOfferCard offer={sampleOffer} serverTime="2026-10-25T07:32:00+09:00" onUse={()=>setDetails(true)}/></article>
 <article className="shopping-stack-card sale-ad-card" aria-hidden={active!==1} inert={active!==1} style={{transform:active===1?"translateY(0)":"translateY(-104%)"}}>
 <Image src="/images/shopping/fresh-family.png" alt="" fill sizes="400px"/><div className="shopping-stack-copy"><span className="shopping-stack-label">広告の表示見本</span><p>毎日の食卓を、もっとかんたんに</p><h2>新鮮な食材で<br/>家族の笑顔を。</h2><button type="button" onClick={()=>setActive(0)}>タイムセールを見る<ShoppingIcon name="arrow"/></button></div>
 </article>
 <button type="button" className="sale-preview-pause" aria-label={paused?"自動切替を再開":"自動切替を停止"} aria-pressed={paused} onClick={()=>setPaused(p=>!p)}>{paused?"▶":"Ⅱ"}</button>
 </div>
 <div className="shopping-stack-dots" aria-label="表示するカード">{["タイムセール","広告"].map((name,i)=><button type="button" key={name} aria-label={name+"を表示"} aria-pressed={active===i} onClick={()=>setActive(i)}><span/></button>)}</div>
 </section>
 </div>
 <div className="shopping-cart-summary"><button type="button"><ShoppingIcon name="cart"/><span className="shopping-basket-label">買い物かご · 3点</span><span className="shopping-basket-price">￥664</span><ShoppingIcon name="arrow" className="shopping-basket-chevron"/></button></div>
 <nav className="shopping-nav" aria-label="買い物ナビ"><div>{([["history","りれき"],["home","ホーム"],["user","マイページ"]] as const).map(([icon,label])=><a key={label} href="#" aria-current={icon==="home"?"page":undefined} onClick={e=>e.preventDefault()}><span><ShoppingIcon name={icon}/></span>{label}</a>)}</div></nav>
 {details&&<StoreOfferDetail offer={sampleOffer} onClose={()=>setDetails(false)} onScan={()=>{}}/>}
 </main>;
}
