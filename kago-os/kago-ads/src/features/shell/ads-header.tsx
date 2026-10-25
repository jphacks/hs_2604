"use client";
import {ConnectedAdsHeader,useAdsRuntime} from "@/features/auth/ads-runtime";
import {usePathname,useRouter} from "next/navigation";
import {useEffect} from "react";
import {getRepository} from "@/lib/data";
import {parseSessionKey,sessionKey,setSession,useSession} from "@/lib/session";
import {AdsTopbar} from "./ads-navigation";
const LOGINS=[
 {key:"guest",label:"ログインしていない"},
 {key:"store_staff:S1",label:"店舗｜広島デモ店"},
 {key:"store_staff:S2",label:"店舗｜広島デモ店 駅前店"},
 {key:"maker_staff:M1",label:"メーカー｜瀬戸内トマト食品"},
 {key:"maker_staff:M2",label:"メーカー｜確認用メーカー"},
];
export function AdsHeader(){const {source}=useAdsRuntime();return source==="mock"?<DemoAdsHeader/>:<ConnectedAdsHeader/>;}
export function DemoAdsHeader(){
 const session=useSession(),pathname=usePathname(),router=useRouter();
 useEffect(()=>{const as=new URLSearchParams(window.location.search).get("as");if(as&&LOGINS.some(l=>l.key===as))setSession(parseSessionKey(as));},[pathname]);
 const nav=session.role==="store_staff"?[
  {href:"/ads/store/calls",label:"自店の募集"},{href:"/ads/portal",label:"募集ポータル"},{href:"/ads/dev/review",label:"審査（確認用）"},{href:"/signage/dev",label:"Signage（確認用）"},
 ]:session.role==="maker_staff"?[
  {href:"/ads/portal",label:"募集を探す"},{href:"/ads/maker/creatives",label:"広告素材"},{href:"/ads/maker/applications",label:"申請一覧"},{href:"/ads/maker/results",label:"広告の成果"},
 ]:[{href:"/ads/portal",label:"募集ポータル"}];
 return <AdsTopbar nav={nav} account="プレビュー">
  <label><span>ログイン（デモ）</span><select aria-label="ログイン（デモ）" value={sessionKey(session)} onChange={e=>{setSession(parseSessionKey(e.target.value));router.push("/ads");}}>{LOGINS.map(l=><option key={l.key} value={l.key}>{l.label}</option>)}</select></label>
  <details className="ads-preview-settings"><summary>設定</summary><div><button className="ads-demo-reset" onClick={async()=>{if(!window.confirm("仮データを最初の状態に戻します。作った募集・広告・申請は消えます。"))return;await getRepository().reset();window.location.reload();}}>仮データを初期化</button></div></details>
 </AdsTopbar>;
}
