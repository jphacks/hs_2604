import {describe,it,expect} from "vitest";
import {crowdDemo,CROWD_DEMO_CATEGORIES,CROWD_DEMO_NOW} from "../../data/demo/crowd";
import {selectCrowdAd,CROWD_POLICY_VERSION} from "./crowd-selection";
const now=new Date(CROWD_DEMO_NOW);
describe("SIG-06 固定集計による選定",()=>{
 it("パスタ・パンの集計に合わせて広告と理由・重みを切り替える",()=>{
  for(const [scenario,key,category] of [["pasta","PASTA","パスタ"],["bread","BREAD","パン"]] as const){
   const {feed,snapshot}=crowdDemo(scenario),d=selectCrowdAd(feed,CROWD_DEMO_CATEGORIES,snapshot,now);
   expect(d.selected_key).toBe(key);expect(d.reason_text).toContain(category);expect(d.policy_version).toBe(CROWD_POLICY_VERSION);expect(d.weights[0].weight).toBe(.75);
  }
 });
 it("少人数は案内へ切り替え、人数とカテゴリ集計をログに残さない",()=>{
  const {feed,snapshot}=crowdDemo("small"),d=selectCrowdAd(feed,CROWD_DEMO_CATEGORIES,snapshot,now);
  expect(d).toMatchObject({selected_key:null,reason_code:"crowd_small",snapshot:null,weights:[]});
 });
 it("欠落・期限切れの集計は広告を選ばない",()=>{
  for(const [s,reason] of [["missing","crowd_missing"],["expired","crowd_expired"]] as const){
   const x=crowdDemo(s);expect(selectCrowdAd(x.feed,CROWD_DEMO_CATEGORIES,x.snapshot,now)).toMatchObject({selected_key:null,reason_code:reason});
  }
 });
 it("停止広告・読込不可素材・期限切れ候補を選ばない",()=>{
  const x=crowdDemo("stopped");expect(selectCrowdAd(x.feed,CROWD_DEMO_CATEGORIES,x.snapshot,now).selected_key).toBe("BREAD");
  const y=crowdDemo("all_stopped");expect(selectCrowdAd(y.feed,CROWD_DEMO_CATEGORIES,y.snapshot,now).selected_key).toBeNull();
  const z=crowdDemo("pasta");expect(selectCrowdAd(z.feed,CROWD_DEMO_CATEGORIES,z.snapshot,now,i=>i.key!=="PASTA").selected_key).toBe("BREAD");
  z.feed.items.forEach(i=>i.valid_until=CROWD_DEMO_NOW);expect(selectCrowdAd(z.feed,CROWD_DEMO_CATEGORIES,z.snapshot,now).selected_key).toBeNull();
 });
 it("個人ID・個人のかごを含む入力と、別店舗の集計を拒否する",()=>{
  const x=crowdDemo("pasta");
  for(const extra of [{user_id:"private"},{baskets:[]},{store_id:"OTHER"}]){
   const d=selectCrowdAd(x.feed,CROWD_DEMO_CATEGORIES,{...x.snapshot,...extra},now);
   expect(d).toMatchObject({reason_code:"crowd_invalid",selected_key:null,snapshot:null});
   expect(JSON.stringify(d)).not.toContain("private");
  }
 });
 it("不正な人数・カテゴリ・時刻・重複カテゴリを拒否する",()=>{
  const x=crowdDemo("pasta");
  const cases=[{data_origin:["synthetic"]},{sample_size:-1},{sample_size:1.5},{sample_size:NaN},{categories:[{category:"不明",visits:1}]},
   {categories:[{category:"パン",visits:9}]},{categories:[{category:"パン",visits:1},{category:"パン",visits:1}]},
   {observed_at:"invalid"},{observed_at:"2026-10-24T12:00:01+09:00"},{expires_at:"2026-10-24T12:06:00+09:00"}];
  for(const change of cases)expect(selectCrowdAd(x.feed,CROWD_DEMO_CATEGORIES,{...x.snapshot,...change},now).reason_code).toBe("crowd_invalid");
 });
 it("候補順・集計順が変わっても再現し、同点はキー順で決める",()=>{
  const x=crowdDemo("pasta"),a=selectCrowdAd(x.feed,CROWD_DEMO_CATEGORIES,x.snapshot,now);
  x.feed.items.reverse();x.snapshot!.categories.reverse();
  expect(selectCrowdAd(x.feed,CROWD_DEMO_CATEGORIES,x.snapshot,now)).toEqual(a);
  x.snapshot!.categories.forEach(c=>c.visits=4);
  expect(selectCrowdAd(x.feed,CROWD_DEMO_CATEGORIES,x.snapshot,now).selected_key).toBe("BREAD");
 });
 it("5人は選定可能、有効期限の終わりは含まず、期限切れ配信内容も使わない",()=>{
  const x=crowdDemo("pasta");x.snapshot!.sample_size=5;x.snapshot!.categories=[{category:"パン",visits:5}];
  expect(selectCrowdAd(x.feed,CROWD_DEMO_CATEGORIES,x.snapshot,now).selected_key).toBe("BREAD");
  expect(selectCrowdAd(x.feed,CROWD_DEMO_CATEGORIES,x.snapshot,new Date(x.snapshot!.expires_at)).reason_code).toBe("crowd_expired");
  x.feed.expires_at=CROWD_DEMO_NOW;
  expect(selectCrowdAd(x.feed,CROWD_DEMO_CATEGORIES,x.snapshot,now).selected_key).toBeNull();
 });
 it("server clock offset keeps aggregate validity and recorded time consistent",()=>{
  for(const offset of [-120000,120000]){
   const x=crowdDemo("pasta");x.feed.clock_offset_ms=offset;
   const d=selectCrowdAd(x.feed,CROWD_DEMO_CATEGORIES,x.snapshot,new Date(now.getTime()-offset));
   expect(d.selected_key).toBe("PASTA");expect(d.selected_at).toBe(now.toISOString());
  }
 });
 it("zero weights and non-ad content use generic guidance",()=>{
  const x=crowdDemo("pasta");x.snapshot!.categories=[];
  expect(selectCrowdAd(x.feed,CROWD_DEMO_CATEGORIES,x.snapshot,now).reason_code).toBe("crowd_no_match");
  x.feed.items.forEach(i=>i.placement_type="store_promo");
  expect(selectCrowdAd(x.feed,CROWD_DEMO_CATEGORIES,x.snapshot,now).reason_code).toBe("crowd_no_content");
 });
});
