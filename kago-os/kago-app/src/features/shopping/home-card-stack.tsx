"use client";
import Image from "next/image";
import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from "react";
import {useRecommendations} from "@/features/recommendations/use-recommendations";
import {useImpression} from "@/features/events/use-impression";
import {MENU_PRODUCT_IMAGES} from "@/lib/product-visuals";
import {shortProductName} from "@/lib/product-name";
import {useAppEvents} from "@/features/events/event-provider";
import {SerendipityOffers} from "@/features/offers/serendipity-offers";
import {RegularReminders} from "@/features/recommendations/regular-reminders";
import {RegularReminderCard} from "@/features/recommendations/regular-reminder-card";
import type {RegularReminder} from "@/features/recommendations/purchase-cycle";
import type {StoreProduct} from "@/features/cart/contracts";
import {useCart} from "@/features/cart/cart-provider";
import {StoreOfferCard} from "@/features/offers/store-offer-card";
import type {SerendipityOffer} from "@/features/offers/contracts";
import type {SavedSelectionItem} from "@/features/recommendations/selection-contracts";
import {ShoppingIcon} from "@/components/shopping-icons";

function subscribeMotion(change:()=>void){const media=window.matchMedia("(prefers-reduced-motion: reduce)");media.addEventListener("change",change);return()=>media.removeEventListener("change",change);}
const motionSnapshot=()=>window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export function HomeCardStack({onOpen,onScan,blocked=false}:{onOpen:(item?:SavedSelectionItem)=>void;onScan:(product:StoreProduct)=>void;blocked?:boolean}){
 return <RegularReminders renderItems={reminders=><SerendipityOffers renderStoreOffers={(offers,onUse,serverTime,offerOpen)=><CardStack onOpen={onOpen} blocked={blocked||offerOpen} offers={offers} onUse={onUse} serverTime={serverTime} reminders={reminders} onScan={onScan}/>}/>}/>;
}
function CardStack({onOpen,blocked,offers,onUse,serverTime,reminders,onScan}:{onOpen:(item?:SavedSelectionItem)=>void;blocked:boolean;offers:SerendipityOffer[];onUse:(offer:SerendipityOffer)=>void;serverTime:string;reminders:RegularReminder[];onScan:(product:StoreProduct)=>void}){
 const cart=useCart();
 const {state}=useRecommendations();
 const track=useAppEvents();
 const container=useRef<HTMLElement>(null);
 const items=state.status==="ready"?[...state.data.items].sort((a,b)=>({sponsored:0,store_promo:1,organic:2}[a.placementType]-{sponsored:0,store_promo:1,organic:2}[b.placementType])||a.rank-b.rank):[];
 const recommendationCards=items.length?items.map(item=>({id:item.selectionItemId,image:MENU_PRODUCT_IMAGES[item.product.code]??"/images/shopping/fresh-family.png",label:item.placementType==="sponsored"?"広告":item.placementType==="store_promo"?"店舗からのおすすめ":"あなたへのおすすめ",kicker:item.sponsor?.headline??"今日のお買い物に",first:shortProductName(item.product.name),second:new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY"}).format(item.product.price),button:"詳細を見る",item})): [{id:"fresh",image:"/images/shopping/fresh-family.png",label:"お買い物のヒント",kicker:"毎日の食卓を、もっとかんたんに",first:"新鮮な食材で",second:"家族の笑顔を。",button:"おすすめ商品を見る",item:undefined}];
 const cards=[...offers.map(offer=>({id:offer.offerId,label:offer.kind==="set_deal"?"セット割":"タイムセール",offer,item:undefined,reminder:undefined})),...reminders.map(reminder=>({id:"regular-"+reminder.product.productId,label:"いつもの商品",reminder,offer:undefined,item:undefined})),...recommendationCards.map(card=>({...card,offer:undefined,reminder:undefined}))];
 const [position,setPosition]=useState({active:0,previous:-1});
 const [hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),[stopped,setStopped]=useState(false);
 const reduced=useSyncExternalStore(subscribeMotion,motionSnapshot,()=>true);
 const current=position.active%cards.length;
 useImpression(container,cards[current]?.item,!blocked);
 const wheelUntil=useRef(0),touch=useRef<{x:number;y:number}|null>(null);
 const move=useCallback((step:number)=>setPosition(p=>({previous:p.active,active:(p.active+step+cards.length)%cards.length})),[cards.length]);
 useEffect(()=>{
  if(blocked||hovered||focused||stopped||reduced||cards.length<2)return;
  const timer=window.setInterval(()=>{if(document.visibilityState==="visible")move(1);},5000);
  return()=>window.clearInterval(timer);
 },[blocked,hovered,focused,stopped,reduced,move,cards.length]);
 return <section ref={container} className="shopping-card-stack" aria-label="広告とおすすめ" aria-roledescription="カルーセル"
  onPointerEnter={e=>{if(e.pointerType==="mouse")setHovered(true);}} onPointerLeave={()=>setHovered(false)}
  onFocusCapture={()=>setFocused(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setFocused(false);}}>
  <div className="shopping-stack-viewport" tabIndex={0} aria-label="上下のスワイプやスクロールで切り替え"
   onWheel={e=>{if(Math.abs(e.deltaY)<8||performance.now()<wheelUntil.current)return;wheelUntil.current=performance.now()+650;move(e.deltaY>0?1:-1);}}
   onKeyDown={e=>{if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();move(e.key==="ArrowDown"?1:-1);}}}
   onPointerDown={e=>{if((e.target as HTMLElement).closest("button"))return;touch.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}}
   onPointerUp={e=>{const start=touch.current;touch.current=null;if(!start)return;const dy=e.clientY-start.y;if(Math.abs(dy)>28&&Math.abs(dy)>Math.abs(e.clientX-start.x))move(dy>0?1:-1);}}>
   {cards.map((card,index)=>{
    const offset=cards.length===1?0:((index-current+cards.length+1)%cards.length)-1;
    const animate=index===current||index===position.previous;
    return <article data-selection-item-id={card.item?.selectionItemId} key={card.id} className={"shopping-stack-card shopping-stack-card-"+card.id} aria-hidden={index!==current} inert={index!==current}
     style={{transform:"translateY("+(-offset*104)+"%)",transition:animate&&!reduced?"transform 480ms cubic-bezier(.2,.75,.25,1)":"none"}}>
     {card.reminder?<RegularReminderCard item={card.reminder} disabled={!cart.canEdit} onScan={()=>onScan(card.reminder.product)}/>:card.offer?<StoreOfferCard offer={card.offer} disabled={!cart.canEdit} serverTime={serverTime} onUse={()=>onUse(card.offer)}/>:<>
     <Image src={card.image} alt="" fill sizes="(max-width:520px) 94vw, 500px"/>
     <div className="shopping-stack-copy">
      <span className="shopping-stack-label">{card.label}</span><p>{card.kicker}</p>
      <h2>{card.first}<br/>{card.second}</h2>
      <button type="button" onClick={()=>{if(card.item)track({event_type:"recommendation_click",selection_item_id:card.item.selectionItemId,product_id:card.item.product.productId,payload:{target:"detail"}});onOpen(card.item);}}>{card.button}<ShoppingIcon name="arrow"/></button>
     </div></>}
    </article>;
   })}
   <button type="button" className="shopping-stack-motion" aria-label={stopped?"広告の自動切替を再開":"広告の自動切替を停止"} aria-pressed={stopped} onClick={()=>setStopped(p=>!p)}>{stopped?"▶":"Ⅱ"}</button>
  </div>
  <div className="shopping-stack-dots" aria-label="表示するカード">{cards.map((card,index)=><button key={card.id} type="button" aria-label={(index+1)+"枚目："+card.label} aria-pressed={current===index} onClick={()=>setPosition(p=>({previous:p.active,active:index}))}><span/></button>)}</div>
 </section>;
}
