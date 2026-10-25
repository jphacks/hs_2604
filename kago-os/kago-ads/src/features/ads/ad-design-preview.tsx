"use client";
import {useState} from "react";
import {AdMedia,PromoMedia} from "@/components/ad-media";
import catalog from "@/data/demo/ad-design-v2.json";
import type {Channel,MediaAsset} from "@/lib/domain/types";
export function AdDesignPreview(){
 const [maker,setMaker]=useState("all"),[channel,setChannel]=useState<Channel>("app");
 const rows=catalog.filter(r=>r.channel===channel&&("maker_id" in r?maker==="all"||r.maker_id===maker:maker==="all"));
 return <main className="min-h-screen bg-[#f2f6f5] text-[#0e2841]">
 <header className="border-b border-[#d9e5e3] bg-white px-6 py-5"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4"><a href="/ad-design" className="text-lg font-black tracking-tight">KAGO / CREATIVE</a><span className="text-xs text-[#60737e]">広告デザイン・未申請素材</span></div></header>
 <div className="mx-auto max-w-6xl px-5 py-10"><p className="text-xs font-bold tracking-[.18em] text-[#078185]">CREATIVE COLLECTION / 02</p><h1 className="mt-3 text-3xl font-bold tracking-tight">食卓に近い、広告へ。</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-[#60737e]">提供いただいたメーカー広告8枚を反映しました。画像内の価格・コピーをそのまま表示します。お店からのおすすめと買い物の案内は、これまでの素材を維持しています。</p>
 <div className="mt-7 flex flex-wrap items-center justify-between gap-4"><div className="flex flex-wrap gap-2">{[["all","すべて"],["M1","瀬戸内トマト食品"],["M2","確認用メーカー"]].map(([id,label])=><button key={id} type="button" aria-pressed={maker===id} onClick={()=>setMaker(id)} className={"rounded-full px-4 py-2 text-sm "+(maker===id?"bg-[#07576b] text-white":"border border-[#d8e4e3] bg-white")}>{label}</button>)}</div>
 <div className="flex gap-2">{(["app","signage"] as const).map(c=><button key={c} type="button" aria-pressed={channel===c} onClick={()=>setChannel(c)} className={"rounded-full px-4 py-2 text-sm "+(channel===c?"bg-[#0e2841] text-white":"border border-[#d8e4e3] bg-white")}>{c==="app"?"App / 正方形":"Signage / 横長"}</button>)}</div></div>
 <div className={"mt-8 grid items-start gap-7 "+(channel==="app"?"sm:grid-cols-2 lg:grid-cols-3":"lg:grid-cols-2")}>{rows.map(r=>{
 const supplied="artwork_source" in r&&r.artwork_source==="user-supplied";
 const asset:MediaAsset={kind:"image",path:r.file,width:r.width,height:r.height,bytes:0,file_name:r.file};
 return <article key={r.asset_id} data-design={r.asset_id} className="min-w-0 overflow-hidden rounded-2xl border border-[#dce6e3] bg-white shadow-sm">{supplied&&<p data-ad-disclosure className="px-4 py-2 text-xs text-[#60737e]">広告｜提供：{"maker_name" in r?r.maker_name:""}</p>}<div data-frame>{r.kind==="store_promo_template"?<PromoMedia asset={asset} channel={channel} productName="トマトパスタソース" reasonText="今日の夕食におすすめ" price={298}/>:<AdMedia asset={asset} channel={channel} makerName={!supplied&&"maker_name" in r?r.maker_name:undefined} price={!supplied&&r.kind==="sponsored"?r.maker_id==="M1"?298:228:undefined}/>}</div>
 <div className="space-y-1 px-4 py-4"><h2 className="text-sm font-bold">{"product_name" in r?r.product_name:r.kind==="fallback"?"買い物の案内":"お店からのおすすめ"}</h2><p className="text-xs text-[#60737e]">{r.asset_id} · {"maker_name" in r?r.maker_name:"KAGO / STORE"}</p></div></article>;
 })}</div>
 {channel==="signage"&&maker!=="M2"&&<section className="mt-10"><h2 className="mb-4 text-xl font-bold">正方形の素材をSignageで使う場合</h2><div data-square-frame className="overflow-hidden rounded-xl"><AdMedia asset={{kind:"image",path:"/ad-assets/design-v2/CR1_v3_app.png",width:1254,height:1254,bytes:0,file_name:"CR1_v3_app.png"}} channel="signage"/></div></section>}
 {channel==="app"&&maker!=="M2"&&<section className="mt-14"><h2 className="text-xl font-bold">これまでの素材</h2><p className="mb-4 mt-2 text-sm text-[#60737e]">旧版はそのまま保持しています。新しい素材も、申請・承認を経てから配信します。</p><div className="max-w-xs overflow-hidden rounded-xl"><AdMedia asset={{kind:"image",path:"/ad-assets/CR1_v2_app.png",width:800,height:800,bytes:0,file_name:"CR1_v2_app.png"}} channel="app" makerName="瀬戸内トマト食品" price={298}/></div></section>}
 </div></main>;
}
