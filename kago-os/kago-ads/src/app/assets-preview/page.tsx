import {AdMedia,PromoMedia} from "@/components/ad-media";
import catalog from "@/data/demo/ad-assets.json";
import type {Channel,MediaAsset} from "@/lib/domain/types";
export default function AssetPreview(){
 return <main className="mx-auto max-w-6xl space-y-8 p-4"><h1 className="text-2xl font-bold">ADS-05 広告素材の表示確認</h1>
 <p>架空ブランドの未申請素材です。承認済み配信ではありません。動画・媒体別素材は現行DBへの登録対象外です。</p>
 <div className="grid gap-8 md:grid-cols-2">{catalog.map(row=>{
 const channel=row.channel as Channel;
 const asset:MediaAsset={kind:row.format==="mp4"?"video":"image",path:"/"+row.file,width:Number(row.width),height:Number(row.height),bytes:0,file_name:row.file,...(row.duration_sec?{duration_sec:Number(row.duration_sec)}:{})};
 return <section key={row.asset_id} data-asset={row.asset_id} className="min-w-0 space-y-2"><h2 className="font-bold">{row.asset_id}</h2><p className="text-sm">{row.product_name||"汎用案内・店舗販促背景"} · {channel}</p>
 <div data-preview>{row.kind==="store_promo_template"?<PromoMedia asset={asset} channel={channel} productName="トマトパスタソース" reasonText="今日の夕食におすすめ" price={298}/>:<AdMedia asset={asset} channel={channel} makerName={row.kind==="sponsored"?row.maker_name:undefined} price={row.kind==="sponsored"?298:undefined}/>}</div>
 <p className="text-xs">{row.status}</p></section>;
 })}</div>
 <h2 className="text-xl font-bold">現行DB：App画像をSignageで表示</h2>
 <div data-square-signage><AdMedia asset={{kind:"image",path:"/ad-assets/CR1_v2_app.png",width:800,height:800,bytes:0,file_name:"CR1_v2_app.png"}} channel="signage" makerName="瀬戸内トマト食品" price={298}/></div>
 </main>;
}
