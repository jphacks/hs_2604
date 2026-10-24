"use client";
import {useState} from "react";
import {Button,Card,PageTitle} from "@/components/parts";
import {CROWD_DEMO_CATEGORIES,CROWD_DEMO_NOW,CROWD_SCENARIOS,crowdDemo,type CrowdScenario} from "@/data/demo/crowd";
import {selectCrowdAd,type CrowdDecision} from "@/lib/signage/crowd-selection";
type Entry={scenario:CrowdScenario;decision:CrowdDecision};
const calculate=(scenario:CrowdScenario):Entry=>{
 const {feed,snapshot}=crowdDemo(scenario);
 return {scenario,decision:selectCrowdAd(feed,CROWD_DEMO_CATEGORIES,snapshot,new Date(CROWD_DEMO_NOW))};
};
export function CrowdDemo(){
 const [state,setState]=useState(()=>{const entry=calculate("pasta");return {entry,history:[entry],replay:""};});
 const {decision}=state.entry;
 const feed=crowdDemo(state.entry.scenario).feed;
 const picked=feed.items.find(i=>i.key===decision.selected_key);
 const choose=(scenario:CrowdScenario)=>setState(prev=>{const entry=calculate(scenario);return {entry,history:[...prev.history,entry].slice(-20),replay:""};});
 function replay(){
  const last=state.history[state.history.length-1],entry=calculate(last.scenario);
  const same=JSON.stringify(entry.decision)===JSON.stringify(last.decision);
  setState(prev=>({...prev,entry,replay:same?"同じ選定を再現しました":"選定が一致しません"}));
 }
 function download(){
  const blob=new Blob([JSON.stringify({format:"sig06-demo-v1",entries:state.history},null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="sig06-selection-log.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <main className="mx-auto max-w-5xl space-y-5 px-4 py-8">
  <PageTitle title="店内傾向による広告選定" lead="SIG-06：固定集計の確認用です。実際の端末表示や共有DBには反映しません。"/>
  <Card className="space-y-3">
   <p className="text-sm font-semibold">固定データ（模擬）・2026年10月24日12時</p>
   <div className="flex flex-wrap gap-2">{CROWD_SCENARIOS.map(s=><Button key={s.id} variant={state.entry.scenario===s.id?"primary":"secondary"} onClick={()=>choose(s.id)}>{s.label}</Button>)}</div>
   <p className="text-xs text-muted">個人のかご・履歴・IDは使いません。5人未満や使えない集計では汎用案内にします。</p>
  </Card>
  <Card className={picked?"border-orange-300 bg-orange-50":"bg-gray-50"}>
   <p className="text-xs text-muted">選定結果</p>
   <h2 className="mt-2 text-3xl font-bold" data-testid="crowd-selected">{picked?.product_name??"汎用のご案内"}</h2>
   <p className="mt-3 text-sm" data-testid="crowd-reason">{decision.reason_text}</p>
   <p className="mt-3 text-xs text-muted">これは広告候補の選定確認で、広告画像の制作例ではありません。</p>
  </Card>
  <Card className="space-y-3">
   <h2 className="font-bold">選定条件と重み</h2>
   <p className="break-all text-sm">ポリシー版：{decision.policy_version}</p>
   {decision.snapshot?<p className="text-sm" data-testid="crowd-snapshot">対象{decision.snapshot.sample_size}人：{decision.snapshot.categories.map(c=>c.category+" "+c.visits+"人").join("・")}</p>:<p className="text-sm text-muted">利用できる集計はありません。少人数の内訳は記録しません。</p>}
   <ul className="space-y-1 text-sm">{decision.weights.map(w=><li key={w.key}>{feed.items.find(i=>i.key===w.key)?.product_name}：{Math.round(w.weight*100)}%</li>)}</ul>
  </Card>
  <Card className="space-y-3">
   <h2 className="font-bold">選定ログ（この画面内・最大20件）</h2>
   <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={replay}>最新の選定を再現</Button><Button variant="secondary" onClick={download}>ログJSONをダウンロード</Button></div>
   {state.replay&&<p role="status" className="text-sm">{state.replay}</p>}
   <ol className="list-inside list-decimal space-y-1 break-words text-sm">{state.history.map((h,n)=><li key={n}>{CROWD_SCENARIOS.find(s=>s.id===h.scenario)?.label} → {h.decision.selected_key??"汎用案内"}（{h.decision.reason_code}）</li>)}</ol>
   <p className="text-xs text-muted">実店内の集計取得・DB保存・Insightでの表示は別途接続が必要です。</p>
  </Card>
 </main>;
}
