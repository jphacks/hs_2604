"use client";
import Link from "next/link";
import {useSession} from "@/lib/session";
import {PageTitle} from "@/components/parts";
import {AdsIcon} from "./ads-navigation";
type Role="guest"|"maker_staff"|"store_staff";
export function AdsHomeView({role}:{role:Role}){
 const store=role==="store_staff";
 const items: {title:string;lead:string;href:string;action:string;icon:"search"|"image"|"send"|"chart"|"store"}[]=store?[
  {title:"自店の募集",lead:"公開中・下書き・終了した募集をまとめて確認できます。",href:"/ads/store/calls",action:"募集一覧を見る",icon:"store"},
  {title:"新しい募集を作成",lead:"対象カテゴリ、掲載期間、掲載先を決めてメーカーを募集します。",href:"/ads/store/calls/new",action:"募集を作成する",icon:"send"},
 ]:[
  {title:"募集を探す",lead:"店舗や掲載先、カテゴリから、広告を出したい募集を見つけましょう。",href:"/ads/portal",action:"募集を探す",icon:"search"},
  {title:"広告素材",lead:"商品と画像を登録。修正した画像は新しい版として管理できます。",href:"/ads/maker/creatives",action:"広告素材を見る",icon:"image"},
  {title:"掲載申請",lead:"申請の状況や店舗からのコメントを確認し、修正・再申請へ進みます。",href:"/ads/maker/applications",action:"申請一覧を見る",icon:"send"},
  {title:"広告の成果",lead:"掲載した広告の表示や反応を、店舗・期間ごとに振り返れます。",href:"/ads/maker/results",action:"成果を確認する",icon:"chart"},
 ];
 return <>
  <PageTitle title={store?"広告募集の管理":"広告の管理"} lead={store?"お店に合う広告を、メーカーから。募集の作成から公開・終了まで、ここで管理できます。":"お店との出会いから、広告の掲載まで。素材・申請・成果をひとつの場所で管理できます。"}/>
  <section className="ads-dashboard" aria-label={store?"店舗の広告募集メニュー":"メーカーの広告管理メニュー"}>
   {items.map((item,i)=><Link href={item.href} key={item.href} className="ads-dashboard-card">
    <div className="ads-dashboard-card-top"><span className="ads-feature-icon"><AdsIcon name={item.icon}/></span><span className="ads-step">0{i+1}</span></div>
    <h2>{item.title}</h2><p>{item.lead}</p><span className="ads-dashboard-action">{item.action}<AdsIcon name="arrow"/></span>
   </Link>)}
  </section>
  <aside className="ads-process-note"><AdsIcon name="check"/><div><strong>{store?"広告の審査は KAGO/Insight で":"掲載前に、お店が内容を確認します"}</strong><p>{store?"募集の公開と、広告の掲載承認は別の操作です。届いた申請の承認・却下はInsightで行ってください。":"広告は申請しただけでは掲載されません。店舗の承認後、選ばれた掲載先（App／Signage）に表示されます。"}</p></div></aside>
 </>;
}
export function AdsHome(){const session=useSession();return <AdsHomeView role={session.role}/>;}
