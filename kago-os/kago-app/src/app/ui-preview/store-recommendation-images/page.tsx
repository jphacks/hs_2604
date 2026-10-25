import {notFound} from "next/navigation";
import Image from "next/image";
import {ShoppingIcon} from "@/components/shopping-icons";
import "@/app/globals.css";
import "@/app/App/shopping-home.css";
import "./preview.css";
const variants=[
 {slug:"a-staff",title:"A：お店の人が選ぶおすすめ",note:"店員さんの笑顔で、お店からのおすすめだと伝える。"},
 {slug:"b-family",title:"B：お店から、家族の食卓へ",note:"元の画像に近い、買い物と食卓をつなぐ親しみやすさ。"},
 {slug:"c-basket",title:"C：今日のおすすめが集まる売り場",note:"いろいろな食材で、商品を限定せずにおすすめ感を伝える。"},
];
export default function Page(){
 if(process.env.NODE_ENV!=="development")notFound();
 return <main className="si166-page">
  <header><h1>店舗からのおすすめ：画像3案</h1><p>同じカードに画像だけを入れて比較しています。実際の画面にはまだ採用していません。</p></header>
  <div className="si166-options">{variants.map(v=><figure key={v.slug}>
   <figcaption><h2>{v.title}</h2><p>{v.note}</p></figcaption>
   <div className="si166-frame shopping-stack-viewport"><article className="shopping-stack-card">
    <Image src={"/images/shopping/store-recommendation-v2/"+v.slug+".webp"} alt="" fill sizes="334px" priority/>
    <div className="shopping-stack-copy"><span className="shopping-stack-label">店舗からのおすすめ</span><p>毎日の食卓を、もっとかんたんに</p>
     <h2>新鮮な食材で<br/>家族の笑顔を。</h2><button type="button">おすすめ商品を見る<ShoppingIcon name="arrow"/></button>
    </div></article></div>
   <a href={"/images/shopping/store-recommendation-v2/"+v.slug+".webp"} target="_blank" rel="noreferrer">画像だけを拡大する →</a>
  </figure>)}</div>
 </main>;
}
