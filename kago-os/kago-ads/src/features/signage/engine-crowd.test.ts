import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {CROWD_DEMO_NOW,CROWD_DEMO_CATEGORIES,crowdDemo,type CrowdScenario} from "@/data/demo/crowd";
import {selectCrowdAd} from "@/lib/signage/crowd-selection";
import {SignageEngine} from "./engine";
import type {SignagePlay} from "@/lib/domain/types";
describe("固定集計と通常再生エンジンの接続",()=>{
 const engines:SignageEngine[]=[];
 beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date(CROWD_DEMO_NOW));});
 afterEach(()=>{for(const e of engines)e.stop();engines.length=0;vi.useRealTimers();});
 function setup(video=false,persistSelection=false){
  let scenario:CrowdScenario="pasta";const saved:SignagePlay[]=[];
  const current=()=>{const value=crowdDemo(scenario);if(video)value.feed.items[0].asset={...value.feed.items[0].asset,kind:"video",duration_sec:5};return value;};
  let fail=false;const retries:SignagePlay[][]=[];
  const engine=new SignageEngine({persistSelection,source:{cacheKey:"fixed",signIn:async()=>({role:"signage",deviceId:"SIG06-D1",storeId:"SIG06-S1"}),
   getFeed:async()=>current().feed,recordPlays:async(_s,plays)=>{retries.push(plays);if(fail)throw new Error("network unavailable");saved.push(...plays);return {rejected:[]};}},
   kv:{get:()=>null,set:()=>undefined},loadMedia:async p=>p,
   select:(feed,at,ready)=>selectCrowdAd(feed,CROWD_DEMO_CATEGORIES,current().snapshot,at,ready)});
  engines.push(engine);
  return {engine,saved,retries,offline:(value:boolean)=>{fail=value;},choose:async(s:CrowdScenario)=>{scenario=s;await engine.refresh();}};
 }
 it("画像は3秒を守ってパスタからパンへ切り替え、再生IDと選定を結び付ける",async()=>{
  const {engine,choose}=setup();await engine.start();expect(engine.getState().screen?.item?.key).toBe("PASTA");
  await choose("bread");expect(engine.getState().screen?.item?.key).toBe("PASTA");
  await vi.advanceTimersByTimeAsync(3000);expect(engine.getState().screen?.item?.key).toBe("BREAD");
  const last=engine.getSelectionHistory().at(-1)!;expect(last.play_id).toBe(engine.getState().screen?.playId);expect(last.decision.policy_version).toBe("sig06-crowd-v1");
 });
 it("少人数では即時に案内へ切り替え、内訳を残さず同じ案内を再開し続けない",async()=>{
  const {engine,choose}=setup();await engine.start();await choose("small");
  const screen=engine.getState().screen!;expect(screen.item).toBeNull();expect(screen.reasonCode).toBe("crowd_small");
  await vi.advanceTimersByTimeAsync(6000);expect(engine.getState().screen?.playId).toBe(screen.playId);
  expect(engine.getSelectionHistory().at(-1)?.decision).toMatchObject({snapshot:null,weights:[]});
 });
 it("停止された広告は最低表示時間を待たずに外す",async()=>{
  const {engine,choose}=setup();await engine.start();await choose("stopped");expect(engine.getState().screen?.item?.key).toBe("BREAD");
  await choose("all_stopped");expect(engine.getState().screen?.item).toBeNull();
 });
 it("材料なし・期限切れでは案内へ切り替える",async()=>{
  const {engine,choose}=setup();await engine.start();await choose("missing");expect(engine.getState().screen?.reasonCode).toBe("crowd_missing");
  await choose("expired");expect(engine.getState().screen?.reasonCode).toBe("crowd_expired");
 });
 it("動画は集計変更だけでは中断せず、再生終了後に次の広告へ進む",async()=>{
  const {engine,choose}=setup(true);await engine.start();const id=engine.getState().screen!.playId;
  await choose("bread");await vi.advanceTimersByTimeAsync(3000);expect(engine.getState().screen?.item?.key).toBe("PASTA");
  engine.onVideoEnded(id);expect(engine.getState().screen?.item?.key).toBe("BREAD");
 });
 it("完了した再生はadaptive・模擬・選定理由で記録し、選定履歴は20件まで",async()=>{
  const {engine,saved}=setup();await engine.start();await vi.advanceTimersByTimeAsync(220000);
  expect(saved.some(p=>p.ended_at&&p.mode==="adaptive"&&p.data_origin==="synthetic"&&p.reason_code==="crowd_category")).toBe(true);
  expect(engine.getSelectionHistory()).toHaveLength(20);
 });
 it("選定履歴付きの再生は通信失敗でも残り、同じ再生IDで再送する",async()=>{
  const {engine,saved,retries,offline,choose}=setup(false,true);await engine.start();
  offline(true);await vi.advanceTimersByTimeAsync(4000);await choose("bread");await engine.refresh();
  expect(engine.getState().outbox).toBeGreaterThan(0);
  expect(retries.flat().some(p=>p.selection?.policy_version==="sig06-crowd-v1")).toBe(true);
  const pending=retries.flat().find(p=>p.selection)!;
  offline(false);await engine.refresh();
  expect(saved.some(p=>p.id===pending.id&&p.selection?.selected_key===pending.selection?.selected_key)).toBe(true);
 });

});
