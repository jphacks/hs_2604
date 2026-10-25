"use client";

import Link from "next/link";
import { ShoppingIcon } from "@/components/shopping-icons";
import { useCart } from "@/features/cart/cart-provider";
import { useShoppingSession } from "@/features/shopping/session-provider";
import { PersonalizationProvider, usePersonalization } from "@/features/recommendations/personalization-provider";
import { AccountShell } from "@/features/shopping/account-shell";
import type { SettingKey } from "@/features/account/contracts";

export default function AccountPage(){
 return <PersonalizationProvider><AccountShell active="account"><AccountContent/></AccountShell></PersonalizationProvider>;
}

function AccountContent(){
 const session=useShoppingSession();
 const preference=usePersonalization();
 const cart=useCart();
 const store=session.stores.find(item=>item.id===session.visit?.store_id);
 return <>
   <div className="account-title"><h1>マイページ</h1><p>お買い物と、おすすめの設定</p></div>
   <section className="account-profile">
     <span className="account-avatar"><ShoppingIcon name="user"/></span>
     <div><span className="account-eyebrow">KAGO/App</span><h2>お買い物アカウント</h2><p>今日も、お買い物をもっとかんたんに。</p></div>
   </section>
   <section className="account-visit">
     <div className="account-section-heading"><span className="account-section-icon"><ShoppingIcon name="store"/></span><h2>いまのお買い物</h2></div>
     <h3>{[store?.name,store?.branch_name].filter(Boolean).join(" ")}</h3>
     <p className="account-visit-date">来店開始　{session.visit&&new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(session.visit.started_at))}</p>
     <Link href="/App?cart=open" className="account-cart-link"><span><ShoppingIcon name="cart"/>買い物かご · {cart.itemCount}点</span><strong>{new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY"}).format(cart.total)}<ShoppingIcon name="arrow"/></strong></Link>
   </section>
   <Link href="/App/history" className="account-menu-link"><span className="account-section-icon"><ShoppingIcon name="history"/></span><span><strong>購入履歴</strong><small>これまでのお買い物を確認</small></span><ShoppingIcon name="arrow"/></Link>
   <section className="account-preferences" aria-labelledby="preferences-heading">
     <div className="account-section-heading"><span className="account-section-icon"><ShoppingIcon name="heart"/></span><h2 id="preferences-heading">おすすめの設定</h2></div>
     <p className="account-section-description">あなたに合った商品を見つけるための設定です。</p>
     {!preference.settings&&preference.busy&&<p role="status" className="account-note">設定を読み込んでいます…</p>}
     {preference.settings&&<div className="account-settings">
       {([
         ["usePurchaseHistory","購入履歴をおすすめに使う","これまでに買った商品を参考にします。"],
         ["useCurrentCart","かごをおすすめに使う","いま、かごに入っている商品を参考にします。"]
       ] as [SettingKey,string,string][]).map(([key,label,description])=><label key={key} className="account-setting">
         <span><strong>{label}</strong><small>{description}</small></span>
         <span className="account-switch"><input type="checkbox" role="switch" aria-label={label} checked={preference.settings![key]} disabled={preference.busy||preference.pending} onChange={event=>preference.updateSetting(key,event.target.checked)}/><span aria-hidden="true"/></span>
       </label>)}
     </div>}
     <p className="account-privacy-note">OFFにしても、お買い物や購入履歴の確認はできます。設定はすべての店舗で共通です。</p>
     {preference.message&&<p role={preference.error?"alert":"status"} className={"account-note"+(preference.error?" account-note-error":"")}>{preference.message}</p>}
     {preference.pending&&<button type="button" disabled={preference.busy} onClick={preference.retry} className="account-retry">同じ設定を再試行</button>}
     <button type="button" disabled={preference.busy} onClick={preference.reload} className="account-reload">設定を再読み込み</button>
   </section>
   <div className="account-session-actions"><button type="button" onClick={session.chooseStore}>店舗・来店を選ぶ</button><button type="button" onClick={session.logout}>ログアウト</button></div>
 </>;
}
