"use client";

import Image from "next/image";
import { useState } from "react";
import { AppBrandHeader } from "@/components/app-brand-header";
import { ShoppingIcon } from "@/components/shopping-icons";
import "./preview.css";

const yen=new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY"});
const lines=[
 {name:"りんご",price:158,quantity:1,image:"/images/products/apple.png"},
 {name:"焼きたて塩パン",price:148,quantity:1,image:"/images/products/shio-pan.png"},
 {name:"若鶏のからあげ",price:358,quantity:1,image:"/images/products/karaage.png"},
];
export function CheckoutPreview(){
 const [screen,setScreen]=useState<"confirm"|"complete">("confirm");
 return <main className="checkout-preview">
   <AppBrandHeader/>
   <div className="checkout-preview-controls" aria-label="見本の画面">{(["confirm","complete"] as const).map(value=><button key={value} type="button" aria-pressed={screen===value} onClick={()=>setScreen(value)}>{value==="confirm"?"レジ確認":"購入完了"}</button>)}</div>
   {screen==="confirm"?<>
     <div className="checkout-preview-heading"><h1>お会計の確認</h1><p>商品と金額をご確認ください</p></div>
     <div className="checkout-preview-content">
       <div className="checkout-preview-store"><ShoppingIcon name="store"/><span>検証1号店</span><small>3点</small></div>
       <section className="checkout-preview-items" aria-label="スキャンした商品">
         {lines.map(item=><div className="checkout-preview-line" key={item.name}><div className="checkout-preview-photo"><Image src={item.image} alt="" fill sizes="60px"/></div><div><h2>{item.name}</h2><p>{item.quantity}点</p></div><strong>{yen.format(item.price)}</strong></div>)}
       </section>
       <div className="checkout-preview-discount"><ShoppingIcon name="coupon"/><span>クーポンが適用されています</span><strong>−{yen.format(100)}</strong></div>
     </div>
     <footer className="checkout-preview-footer"><div className="checkout-preview-subtotal"><span>商品合計</span><span>{yen.format(664)}</span></div><div className="checkout-preview-total"><span>お支払い合計</span><strong>{yen.format(564)}</strong></div>
       <button type="button" className="checkout-preview-primary" onClick={()=>setScreen("complete")}>お会計を確定する<ShoppingIcon name="arrow"/></button>
       <a href="/App?cart=open" className="checkout-preview-secondary">買い物かごに戻る</a>
     </footer>
   </>:<>
     <div className="checkout-preview-complete">
       <span className="checkout-preview-check" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m10 20 7 7 14-15"/></svg></span>
       <h1>お買い物が完了しました</h1><p>ご利用ありがとうございました。</p>
       <div className="checkout-preview-receipt"><div><ShoppingIcon name="store"/><strong>検証1号店</strong></div><p><span>お買い上げ点数</span><strong>3点</strong></p><p><span>クーポン割引</span><strong>−{yen.format(100)}</strong></p><div className="checkout-preview-total"><span>合計</span><strong>{yen.format(564)}</strong></div></div>
       <a href="/App/history" className="checkout-preview-primary"><ShoppingIcon name="history"/>購入履歴を見る</a><a href="/App" className="checkout-preview-secondary">ホームに戻る</a>
     </div>
   </>}
   <p className="checkout-preview-note">UIの見本です。注文の保存・決済は行いません。</p>
 </main>;
}
