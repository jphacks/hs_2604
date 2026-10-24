"use client";

import { AppBrandHeader } from "@/components/app-brand-header";
import { useState } from "react";
import { SuggestionDetail } from "@/features/recommendations/suggestion-detail";
import type { SavedSelectionItem,PlacementType } from "@/features/recommendations/selection-contracts";

export function ProductPreview(){
 const [type,setType]=useState<PlacementType>("organic");
 const [open,setOpen]=useState(true);
 const item:SavedSelectionItem={
   slot:0,rank:1,selectionItemId:"preview-only",
   placementType:type,reasonCode:type==="sponsored"?"sponsored_related":type==="store_promo"?"store_pick":"co_purchase",
   reasonText:type==="organic"?"かごに入れたパンと一緒に、朝の食卓にいかがですか。":type==="store_promo"?"いつもの食卓に、旬のおいしさを。お店からのおすすめです。":"いつものお買い物に、もうひとつのおいしさを。",
   product:{productId:"preview-only",code:"PLU-1002",name:"りんご",category:"果物",price:158},
   adPlacementId:null,promotionVersionId:null,evidence:{},
   sponsor:type==="sponsored"?{makerName:"架空フーズ（見本）",headline:"食卓に、毎日の彩りを。",creativeVersionId:"preview-only"}:null
 };
 return <div className="product-detail-preview" style={{height:"100dvh",background:"#F2F5F6",margin:0,fontFamily:"Arial,sans-serif"}}>
   <AppBrandHeader/>
   {!open&&<button type="button" onClick={()=>setOpen(true)} style={{display:"block",margin:"100px auto",border:0,borderRadius:24,padding:"14px 24px",background:"#07576B",color:"white"}}>商品詳細を開く</button>}
   {open&&<SuggestionDetail scanRequired item={item} label={type==="organic"?"一緒におすすめ":type==="store_promo"?"店舗からのおすすめ":"広告"} added={false} disabled={false} previewControls={<div className="suggestion-detail-preview-controls" aria-label="見本の種類">
     {(["organic","store_promo","sponsored"] as const).map(value=><button key={value} type="button" aria-pressed={type===value} onClick={()=>{setType(value);setOpen(true);}}>{value==="organic"?"おすすめ":value==="store_promo"?"店舗のおすすめ":"広告"}</button>)}
   </div>} onClose={()=>setOpen(false)} onAdd={()=>setOpen(false)}/>}
 </div>;
}
