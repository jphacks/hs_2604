import {beforeAll,afterAll,describe,it,expect} from "vitest";
import {createHeadlessBackend} from "@kago/backend";
import {createSignageDatabase,fixturePassword,id,user} from "../../../tests/fixtures/signage-database.mts";
import {signInDevice,loadSignageFeed,insertSignagePlays,type SignageClient} from "./signage";
import {selectCrowdAd,type CrowdDecision} from "../signage/crowd-selection";
import {startPlay,endPlay} from "../signage/plays";

describe("SIG-06 実SQLの店内集計・選定履歴・自店権限",()=>{
 let recorded:CrowdDecision;
 let f:Awaited<ReturnType<typeof createSignageDatabase>>;
 beforeAll(async()=>{
  f=await createSignageDatabase();
  for(let n=201;n<=205;n++){
   await f.db.query("insert into auth.users(id,email) values($1,$2)",[id(n),`crowd-${n}@example.test`]);
   await f.db.query("insert into visits(id,user_id,store_id,started_at,last_activity_at) values($1,$2,$3,now()-interval '20 minutes',now()-($4::int*interval '1 minute'))",[id(n+100),id(n),id(1),n===205?16:0]);
   await f.db.query("insert into cart_items(visit_id,product_id,quantity) values($1,$2,1)",[id(n+100),id(22)]);
  }
 },60000);
 afterAll(async()=>{await f?.close();});
 const crowd=()=>f.asUser(user("device-one@example.test"),async()=>(await f.db.query<{s:Record<string,unknown>}>("select kago_signage_crowd() s")).rows[0].s);
 it("15分以上活動のない来店を除外し、5人未満なら人数も内訳も隠す",async()=>{
  const s=await crowd();expect(s.sample_size).toBe(0);expect(s.categories).toEqual([]);
  await f.db.query("update visits set last_activity_at=now() where id=$1",[id(305)]);
 });
 it("5人の自店かごをカテゴリ単位で返し、個人ID・明細・他店のデータを渡さない",async()=>{
  const s=await crowd();expect(s.sample_size).toBe(5);expect(s.categories).toEqual([{category:"調味料",visits:5}]);
  expect(Object.keys(s).sort()).toEqual(["schema_version","store_id","data_origin","observed_at","expires_at","sample_size","categories"].sort());
  expect(JSON.stringify(s)).not.toContain(id(201));
  const other=await f.asUser(user("device-two@example.test"),async()=>(await f.db.query<{s:{sample_size:number;categories:unknown[]}}>("select kago_signage_crowd() s")).rows[0].s);
  expect(other.sample_size).toBe(0);expect(other.categories).toEqual([]);
 });
 it("同じ利用者の重複来店では少人数判定を回避できない",async()=>{
  await f.db.query("insert into visits(id,user_id,store_id) values($1,$2,$3)",[id(399),id(201),id(1)]);
  expect((await crowd()).sample_size).toBe(5);
 });
 it("カテゴリが5人未満なら、その内訳を返さない",async()=>{
  await f.db.query("delete from cart_items where visit_id=$1",[id(305)]);
  expect((await crowd()).categories).toEqual([]);
  await f.db.query("insert into cart_items(visit_id,product_id,quantity) values($1,$2,1)",[id(305),id(22)]);
 });
 it("メーカー・店舗担当・顧客・停止端末は集計RPCを呼べない",async()=>{
  for(const email of ["maker@example.test","store@example.test","customer@example.test","device-off@example.test"]){
   await expect(f.asUser(user(email),async()=>f.db.query("select kago_signage_crowd()"))).rejects.toMatchObject({code:"42501"});
  }
 });
 it("通常の端末窓口で実集計を選定し、再生と履歴を保存・再送する",async()=>{
  const c=createHeadlessBackend({url:"https://fixture.supabase.co",publishableKey:"sb_publishable_fixture"},f.fetcher) as SignageClient;
  const session=await signInDevice(c,"device-one@example.test",fixturePassword);
  const feed=await loadSignageFeed(c,session,new Date(),true);
  expect(feed.crowd?.snapshot?.sample_size).toBe(5);
  const decision=selectCrowdAd(feed,feed.crowd!.categoryByKey,feed.crowd!.snapshot,new Date());
  recorded=decision;expect(decision.selected_key).toBe(id(71));expect(decision.reason_code).toBe("crowd_category");
  const play=endPlay({...startPlay(id(41),feed.items.find(i=>i.key===id(71))!,"no_content",decision.selected_at,id(950)),
   mode:"adaptive",reason_code:decision.reason_code,selection:decision},new Date(Date.parse(decision.selected_at)+4000).toISOString(),"completed");
  expect(await insertSignagePlays(c,session,[play])).toEqual({rejected:[]});
  expect(await insertSignagePlays(c,session,[play])).toEqual({rejected:[]});
  const all=(await f.db.query<{play_id:string}>("select * from signage_decisions")).rows;expect(all).toHaveLength(1);
  expect(all[0].play_id).toBe(id(950));
  for(const email of ["device-one@example.test","maker@example.test","customer@example.test"]){
   const visible=await f.asUser(user(email),async()=>(await f.db.query("select * from signage_decisions")).rows);
   expect(visible).toHaveLength(0);
  }
  expect(await f.asUser(user("store@example.test"),async()=>(await f.db.query("select * from signage_decisions")).rows)).toHaveLength(1);
  await expect(f.asUser(user("device-two@example.test"),async()=>f.db.query("select kago_record_signage_decision($1,$2::jsonb)",[id(950),JSON.stringify(decision)]))).rejects.toMatchObject({code:"42501"});
  await expect(f.asUser(user("device-one@example.test"),async()=>f.db.query("select kago_record_signage_decision($1,$2::jsonb)",[id(950),JSON.stringify({...decision,extra_person_id:id(201)})]))).rejects.toMatchObject({code:"23514"});
  await expect(f.asUser(user("device-one@example.test"),async()=>f.db.query("select kago_record_signage_decision($1,$2::jsonb)",[id(950),JSON.stringify({...decision,policy_version:null})]))).rejects.toMatchObject({code:"23514"});
 });
 it("矛盾した重み・少人数内訳・追加個人情報・期限切れを、新しい再生の履歴にも保存できない",async()=>{
  const variants=[
   {...recorded,weights:recorded.weights.map(w=>({...w,weight:0.5}))},
   {...recorded,weights:[...recorded.weights,...recorded.weights]},
   {...recorded,snapshot:{...recorded.snapshot,sample_size:4}},
   {...recorded,snapshot:{...recorded.snapshot,user_id:id(201)}},
   {...recorded,snapshot:{...recorded.snapshot,categories:[{category:"調味料",visits:4}]}},
   {...recorded,snapshot:{...recorded.snapshot,expires_at:recorded.selected_at}},
  ];
  for(const [i,decision]of variants.entries()){
   const playId=id(960+i);
   await f.db.query("insert into signage_plays select (jsonb_populate_record(null::signage_plays,to_jsonb(p)||jsonb_build_object('id',$1::text))).* from signage_plays p where id=$2",[playId,id(950)]);
   await expect(f.asUser(user("device-one@example.test"),async()=>f.db.query("select kago_record_signage_decision($1,$2::jsonb)",[playId,JSON.stringify(decision)]))).rejects.toMatchObject({code:"23514"});
  }
  expect((await f.db.query("select * from signage_decisions")).rows).toHaveLength(1);
 });
 it("匿名へのRPC実行権限と、店舗担当への直接更新権限を与えない",async()=>{
  const permissions=(await f.db.query<{crowd:boolean;record:boolean}>("select has_function_privilege('anon','public.kago_signage_crowd()','execute') crowd,has_function_privilege('anon','public.kago_record_signage_decision(uuid,jsonb)','execute') record")).rows[0];
  expect(permissions).toEqual({crowd:false,record:false});
  await expect(f.asUser(user("store@example.test"),async()=>f.db.query("update signage_decisions set decision='{}'"))).rejects.toMatchObject({code:"42501"});
 });

});
