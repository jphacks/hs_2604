"use client";
import Image from "next/image";
import {ShoppingIcon} from "@/components/shopping-icons";
import {MENU_PRODUCT_IMAGES,productIcon} from "@/lib/product-visuals";
import type {RegularReminder} from "./purchase-cycle";
import "./regular-reminder-card.css";
export function RegularReminderCard({item,disabled,onScan}:{item:RegularReminder;disabled:boolean;onScan:()=>void}){
 const image=MENU_PRODUCT_IMAGES[item.product.code];
 return <div className="regular-reminder-card"><span className="regular-reminder-label">いつもの商品</span><h2>そろそろ買う頃です</h2><div className="regular-reminder-product"><div><h3>{item.product.name}</h3><strong>{new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY"}).format(item.product.price)}</strong><p>約{Math.max(1,Math.round(item.intervalDays))}日ごと・前回{Math.round(item.daysSinceLastPurchase)}日前</p></div><span className="regular-reminder-photo" aria-hidden="true">{image?<Image src={image} alt="" fill sizes="120px"/>:productIcon(item.product)}</span></div><button type="button" disabled={disabled} onClick={onScan}><ShoppingIcon name="camera"/>商品のバーコードを読み取る</button><small>購入履歴から計算した目安です</small></div>;
}
