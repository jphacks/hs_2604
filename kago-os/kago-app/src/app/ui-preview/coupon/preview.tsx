"use client";
import { AppBrandHeader } from "@/components/app-brand-header";
import { useState } from "react";
import { CouponDetail } from "@/features/offers/coupon-detail";
import { CouponArrival } from "@/features/offers/coupon-arrival";
import type { SerendipityOffer } from "@/features/offers/contracts";

const offer:SerendipityOffer={
 offerId:"preview-only",kind:"guerrilla_coupon",headline:"今日の食卓に、あと一品。",
 discountPercent:null,discountAmount:100,unitDiscount:100,
 startsAt:"2026-10-25T00:00:00+09:00",endsAt:"2026-10-25T20:00:00+09:00",
 product:{productId:"preview-only",code:"PLU-2002",name:"若鶏のからあげ",category:"惣菜",price:358,available:true},
 trigger:null,productInCart:false,triggerInCart:false,action:"add",
 reason:"いまのお買い物に合わせて、食卓に添えたい一品を選びました。",discountLabel:"100円OFF",score:0,relation:null
};
export function CouponPreview(){
 const [screen,setScreen]=useState<"arrival"|"detail">("arrival");
 const [hidden,setHidden]=useState(false);
 const [variant,setVariant]=useState<"guerrilla"|"standard">("guerrilla");
 const controls=<div className="coupon-detail-preview-controls" aria-label="見本の表示">
   {(["arrival","detail"] as const).map(value=><button key={value} type="button" aria-pressed={screen===value} onClick={()=>{setScreen(value);setHidden(false);}}>{value==="arrival"?"届いたとき":"クーポン詳細"}</button>)}
 </div>;
 return <div className="coupon-preview" style={{height:"100dvh",background:"#F2F5F6",fontFamily:"Arial,sans-serif"}}>
   <AppBrandHeader/>
   <div className="coupon-preview-variant" aria-label="クーポンの見た目"><button type="button" aria-pressed={variant==="guerrilla"} onClick={()=>setVariant("guerrilla")}>ゲリラ</button><button type="button" aria-pressed={variant==="standard"} onClick={()=>{setVariant("standard");setScreen("detail");}}>通常</button></div>
   {screen==="arrival"?<><div style={{marginTop:30}}>{controls}</div><p style={{textAlign:"center",fontSize:13,color:"#5C6C7A",marginTop:100}}>商品を追加したあとの、お知らせの見本です。</p>{!hidden&&<CouponArrival name={offer.product.name} discount={offer.discountLabel} onOpen={()=>setScreen("detail")} onDismiss={()=>setHidden(true)}/>}</>:<CouponDetail scanRequired appearance={variant} offer={offer} disabled={false} onClose={()=>setScreen("arrival")} onDismiss={()=>setScreen("arrival")} onClaim={()=>setScreen("arrival")} previewControls={controls}/>}
 </div>;
}
