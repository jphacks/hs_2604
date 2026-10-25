"use client";
import {useEffect,useState,useSyncExternalStore} from "react";
import {CROWD_DEMO_NOW,CROWD_DEMO_CATEGORIES,CROWD_SCENARIOS,crowdDemo,type CrowdScenario} from "@/data/demo/crowd";
import {selectCrowdAd} from "@/lib/signage/crowd-selection";
import {SignageEngine,type EngineState} from "./engine";
import {ScreenView} from "./player";
import type {SignagePlay} from "@/lib/domain/types";
const empty:EngineState={phase:"starting",screen:null,online:false,simulatedOffline:false,outbox:0,sent:0,rejected:0};
function runtime(){
 let scenario:CrowdScenario="pasta";
 const base=Date.now(),now=()=>Date.parse(CROWD_DEMO_NOW)+Date.now()-base;
 const recorded:SignagePlay[]=[];
 const storage=new Map<string,string>();
 const engine=new SignageEngine({
  source:{cacheKey:"SIG06-fixed-player",signIn:async()=>({role:"signage",deviceId:"SIG06-D1",storeId:"SIG06-S1"}),
   getFeed:async()=>{const feed=crowdDemo(scenario).feed;feed.items=feed.items.map(i=>({...i,asset:{...i.asset,path:"/signage/demo/"+(i.key==="PASTA"?"pasta":"bread")+".svg"}}));return feed;},recordPlays:async(_session,plays)=>{for(const play of plays)if(!recorded.some(p=>p.id===play.id))recorded.push(play);return {rejected:[]};}},
  kv:{get:key=>storage.get(key)??null,set:(key,value)=>{storage.set(key,value);}},
  loadMedia:async path=>path,now,
  select:(feed,at,ready)=>selectCrowdAd(feed,CROWD_DEMO_CATEGORIES,crowdDemo(scenario).snapshot,at,ready)
 });
 return {engine,recorded,choose:async(value:CrowdScenario)=>{scenario=value;await engine.refresh();}};
}
export function CrowdPlayer(){
 const [app]=useState(runtime);
 const state=useSyncExternalStore(app.engine.subscribe,app.engine.getState,()=>empty);
 useEffect(()=>{void app.engine.start();return()=>{app.engine.close();app.engine.stop();};},[app]);
 function download(){
  const blob=new Blob([JSON.stringify({format:"sig06-player-v1",selections:app.engine.getSelectionHistory(),completed_plays:app.recorded},null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="sig06-player.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <main className="mx-auto max-w-6xl space-y-4 p-4">
  <h1 className="text-xl font-bold">SIG-06 通常プレイヤーの固定集計確認</h1>
  <p>合成データ専用。通常と同じ再生エンジン・広告表示部品を使用します。共有DB・実端末へ接続しません。集計は起動から5分で期限切れになり、再読み込みで固定条件に戻ります。</p>
  <div className="flex flex-wrap gap-2">{CROWD_SCENARIOS.map(s=><button className="rounded border p-2" key={s.id} onClick={()=>void app.choose(s.id)}>{s.label}</button>)}</div>
  <div className="bg-black" data-testid="crowd-player-screen">{state.screen&&<ScreenView screen={state.screen} engine={app.engine}/>}</div>
  <p data-testid="crowd-player-selected">{state.screen?.item?.product_name??"汎用のご案内"}</p>
  <p data-testid="crowd-player-reason">{state.selection?.reason_text}</p>
  <p>画像は最低3秒、動画は終了まで待って切り替えます。停止・集計の抑制は即時に反映します。</p>
  <button className="rounded border p-2" onClick={download}>再生と選定のJSONを保存</button>
  <p className="text-sm">選定記録は再生IDと結び付けて最大20件をメモリに保持。実集計・DB保存・Insight表示は未接続です。</p>
 </main>;
}
