"use client";

import Image from "next/image";
import type { ReactNode,Ref } from "react";
import { ShoppingIcon } from "@/components/shopping-icons";
import { MENU_PRODUCT_IMAGES,productIcon } from "@/lib/product-visuals";
import { offerKindLabel,type SerendipityOffer } from "./contracts";
import "./coupon-detail.css";

type Props={offer:SerendipityOffer;disabled:boolean;onClose:()=>void;onClaim:()=>void;onDismiss:()=>void;closeButtonRef?:Ref<HTMLButtonElement>;previewControls?:ReactNode;appearance?:"guerrilla"|"standard";scanRequired?:boolean;redemption?:ReactNode};
const yen=new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY"});
const date=new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
export function CouponDetail({offer,disabled,onClose,onClaim,onDismiss,closeButtonRef,previewControls,appearance="guerrilla",scanRequired=false,redemption}:Props){
 const image=MENU_PRODUCT_IMAGES[offer.product.code];
 return <div className="coupon-detail-overlay">
   <button type="button" tabIndex={-1} className="coupon-detail-backdrop" onClick={onClose} aria-label="クーポンを閉じる"/>
   <div className="coupon-detail-group">{previewControls}
     <section role="dialog" aria-modal="true" aria-label={offer.headline} className={"coupon-detail-sheet"+(appearance==="guerrilla"?" coupon-detail-guerrilla":"")+(redemption?" coupon-detail-scanning":"")}>
       <div className="coupon-detail-handle" aria-hidden="true"/>
       <header className="coupon-detail-header"><span><ShoppingIcon name="coupon"/>{appearance==="guerrilla"?"ゲリラクーポン":offer.kind==="guerrilla_coupon"?"クーポン":offerKindLabel[offer.kind]}</span><button ref={closeButtonRef} type="button" onClick={onClose} aria-label="閉じる">×</button></header>
       <div className="coupon-detail-body">
         {redemption?<>{redemption}</>:<>
         <div className="coupon-detail-discount"><p>あなたに届いた、お得なお知らせ</p><strong>{offer.discountLabel}</strong><h2 id="coupon-heading">{offer.headline}</h2></div>
         <div className="coupon-detail-product">
           <div className="coupon-detail-photo" aria-hidden="true">{image?<Image src={image} alt="" fill sizes="110px"/>:<span>{productIcon(offer.product)}</span>}</div>
           <div className="coupon-detail-product-copy"><p>{offer.product.category}</p><h3>{offer.product.name}</h3><div className="coupon-detail-price"><del>{yen.format(offer.product.price)}</del><span aria-hidden="true">→</span><strong>{yen.format(offer.product.price-offer.unitDiscount)}</strong></div></div>
         </div>
         <div className="coupon-detail-reason"><h3><ShoppingIcon name="heart"/>あなたへのおすすめ</h3><p>{offer.reason}</p></div>
         <p className="coupon-detail-deadline"><ShoppingIcon name="history"/><span>1点まで · <time dateTime={offer.endsAt}>{date.format(new Date(offer.endsAt))}</time>まで</span></p>
         </>}
       </div>
       <footer className="coupon-detail-footer">{scanRequired&&!redemption&&<p className="coupon-scan-guidance">対象商品をスキャンすると、割引が適用されます。</p>}{!redemption&&<button type="button" disabled={disabled} onClick={onClaim} className="coupon-detail-claim"><ShoppingIcon name={scanRequired?"coupon":"cart"}/>{scanRequired?"クーポンを受け取る":offer.action==="apply"?"かごの商品に割引を適用":"割引付きでかごに追加"}</button>}<button type="button" onClick={onDismiss} className="coupon-detail-dismiss">今回は見送る</button></footer>
     </section>
   </div>
 </div>;
}
