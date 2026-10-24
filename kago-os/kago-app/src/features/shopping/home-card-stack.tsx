"use client";
import Image from "next/image";
import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from "react";
import {ShoppingIcon} from "@/components/shopping-icons";

// UI review samples. Actual approved ads and saved recommendation slots will be connected after design approval.
const cards=[
 {id:"fresh",image:"/images/shopping/fresh-family.png",label:"広告",kicker:"毎日の食卓を、もっとかんたんに",first:"新鮮な食材で",second:"家族の笑顔を。",button:"おすすめ商品を見る"},
 {id:"vegetables",image:"/images/shopping/category-vegetables.png",label:"あなたへのおすすめ",kicker:"今日のおいしい、見つけよう",first:"旬の野菜で、",second:"彩りのある食卓に。",button:"商品を見る"},
 {id:"bread",image:"/images/shopping/category-bread.png",label:"店舗からのおすすめ",kicker:"いつもの朝を、ちょっと楽しみに",first:"ふんわり焼きたて、",second:"朝のごほうび。",button:"商品を見る"},
];
function subscribeMotion(change:()=>void){const media=window.matchMedia("(prefers-reduced-motion: reduce)");media.addEventListener("change",change);return()=>media.removeEventListener("change",change);}
const motionSnapshot=()=>window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export function HomeCardStack({onOpen,blocked=false}:{onOpen:()=>void;blocked?:boolean}){
 const [position,setPosition]=useState({active:0,previous:-1});
 const [hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),[stopped,setStopped]=useState(false);
 const reduced=useSyncExternalStore(subscribeMotion,motionSnapshot,()=>true);
 const wheelUntil=useRef(0),touch=useRef<{x:number;y:number}|null>(null);
 const move=useCallback((step:number)=>setPosition(p=>({previous:p.active,active:(p.active+step+cards.length)%cards.length})),[]);
 useEffect(()=>{
  if(blocked||hovered||focused||stopped||reduced)return;
  const timer=window.setInterval(()=>{if(document.visibilityState==="visible")move(1);},5000);
  return()=>window.clearInterval(timer);
 },[blocked,hovered,focused,stopped,reduced,move]);
 return <section className="shopping-card-stack" aria-label="広告とおすすめ" aria-roledescription="カルーセル"
  onPointerEnter={e=>{if(e.pointerType==="mouse")setHovered(true);}} onPointerLeave={()=>setHovered(false)}
  onFocusCapture={()=>setFocused(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setFocused(false);}}>
  <div className="shopping-stack-viewport" tabIndex={0} aria-label="上下のスワイプやスクロールで切り替え"
   onWheel={e=>{if(Math.abs(e.deltaY)<8||performance.now()<wheelUntil.current)return;wheelUntil.current=performance.now()+650;move(e.deltaY>0?1:-1);}}
   onKeyDown={e=>{if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();move(e.key==="ArrowDown"?1:-1);}}}
   onPointerDown={e=>{if((e.target as HTMLElement).closest("button"))return;touch.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}}
   onPointerUp={e=>{const start=touch.current;touch.current=null;if(!start)return;const dy=e.clientY-start.y;if(Math.abs(dy)>28&&Math.abs(dy)>Math.abs(e.clientX-start.x))move(dy>0?1:-1);}}>
   {cards.map((card,index)=>{
    const offset=((index-position.active+cards.length+1)%cards.length)-1;
    const animate=index===position.active||index===position.previous;
    return <article key={card.id} className={"shopping-stack-card shopping-stack-card-"+card.id} aria-hidden={index!==position.active} inert={index!==position.active}
     style={{transform:"translateY("+(-offset*104)+"%)",transition:animate&&!reduced?"transform 480ms cubic-bezier(.2,.75,.25,1)":"none"}}>
     <Image src={card.image} alt="" fill sizes="(max-width:520px) 94vw, 500px"/>
     <div className="shopping-stack-copy">
      <span className="shopping-stack-label">{card.label}</span><p>{card.kicker}</p>
      <h2>{card.first}<br/>{card.second}</h2>
      <button type="button" onClick={onOpen}>{card.button}<ShoppingIcon name="arrow"/></button>
     </div>
    </article>;
   })}
   <button type="button" className="shopping-stack-motion" aria-label={stopped?"広告の自動切替を再開":"広告の自動切替を停止"} aria-pressed={stopped} onClick={()=>setStopped(p=>!p)}>{stopped?"▶":"Ⅱ"}</button>
  </div>
  <div className="shopping-stack-dots" aria-label="表示するカード">{cards.map((card,index)=><button key={card.id} type="button" aria-label={(index+1)+"枚目："+card.label} aria-pressed={position.active===index} onClick={()=>setPosition(p=>({previous:p.active,active:index}))}><span/></button>)}</div>
 </section>;
}
