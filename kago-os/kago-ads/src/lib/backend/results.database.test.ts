import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {createHeadlessBackend,signInBackend,signOutBackend} from "@kago/backend";
import {createResultsDatabase,metricId} from "../../../tests/fixtures/results-database.mts";
import {fixturePassword,users} from "../../../tests/fixtures/portal-database.mts";
import {createSupabaseResultsRepository} from "./results";
import {summarizeApp,summarizeSignage} from "../results/results";
const query={start:"2026-10-22T00:00:00+09:00",end:"2026-10-23T00:00:00+09:00"};
const session={role:"maker_staff",makerId:metricId("7",1)} as const;
describe("ADS-04 正式DB-09・RLSと成果画面の接続",()=>{
 let f:Awaited<ReturnType<typeof createResultsDatabase>>;
 beforeAll(async()=>{f=await createResultsDatabase();},30_000);
 afterAll(async()=>{await f?.close();});
 async function client(n=101){
  const c=createHeadlessBackend({url:"https://results-fixture.invalid",publishableKey:"sb_publishable_fixture"},f.fetcher);
  await signInBackend(c,users.find(u=>u.n===n)!.email,fixturePassword);return c;
 }
 it("本人の広告だけに正式集計を結び、実測・事前投入を分離する",async()=>{
  const data=await createSupabaseResultsRepository(await client()).listMakerResults(session,query);
  expect(data.placements.map(p=>p.id)).toEqual([metricId("c",1)]);
  const app=summarizeApp(data.placements[0],data.app);
  expect(app.find(x=>x.origin==="operated")).toMatchObject({impressions:1,shownVisits:1,clicks:1,purchases:1,purchasedQuantity:2,purchaseAmount:200,smallSample:true});
  expect(app.find(x=>x.origin==="seeded")).toMatchObject({impressions:1,purchases:0});
  const signage=summarizeSignage(data.placements[0],data.signage);
  expect(signage.find(x=>x.origin==="operated")).toMatchObject({plays:4,playSeconds:60,estimatedViewers:0,referenceSales:3});
  expect(signage.find(x=>x.origin==="seeded")?.estimatedViewers).toBe("unmeasured");
 });
 it("別メーカーには別の広告だけを返し、偽の画面IDでも本人の範囲を守る",async()=>{
  const repo=createSupabaseResultsRepository(await client(102));
  const data=await repo.listMakerResults(session,query);
  expect(data.placements.map(p=>p.id).sort()).toEqual([metricId("c",2),metricId("c",3)]);
  expect(data.app.every(r=>r.ad_placement_id!==metricId("c",1))).toBe(true);
  const filtered=await repo.listMakerResults(session,{...query,storeId:metricId("2",2)});
  expect(filtered.placements.map(p=>p.id)).toEqual([metricId("c",3)]);
 });
 it("DB自体が公開範囲外をnullにし、画面も0に置き換えない",async()=>{
  await f.db.query("update ad_calls set disclosure_scope=$1 where id=$2",[["impressions","clicks"],metricId("8",1)]);
  try{
   const data=await createSupabaseResultsRepository(await client()).listMakerResults(session,query);
   expect(data.app.every(r=>r.purchases===null && r.purchase_amount===null)).toBe(true);
   expect(data.signage.every(r=>r.plays===null && r.reference_sales_quantity===null)).toBe(true);
   expect(summarizeApp(data.placements[0],data.app)[0].purchases).toBeNull();
   expect(summarizeSignage(data.placements[0],data.signage)[0].plays).toBeNull();
  }finally{await f.db.query("update ad_calls set disclosure_scope=$1 where id=$2",[["impressions","clicks","cart_adds","purchases","signage_views"],metricId("8",1)]);}
 });
 it("期間の排他終了境界・記録0件を正式関数で確認する",async()=>{
  const repo=createSupabaseResultsRepository(await client());
  const empty=await repo.listMakerResults(session,{start:"2026-10-22T17:00:00+09:00",end:"2026-10-22T17:00:10+09:00"});
  expect(empty.app).toEqual([]);
  expect(summarizeApp(empty.placements[0],empty.app)[0]).toMatchObject({impressions:0,smallSample:false});
  const at=await repo.listMakerResults(session,{start:"2026-10-22T17:00:10+09:00",end:"2026-10-22T17:00:11+09:00"});
  expect(at.app.some(r=>r.impressions===1)).toBe(true);
 });
 it("未所属・別役割・ログアウトを拒否し、生の購買明細も読ませない",async()=>{
  for(const n of [103,104,105])await expect(createSupabaseResultsRepository(await client(n)).listMakerResults(session,query)).rejects.toMatchObject({code:"forbidden"});
  expect((await f.db.query("select * from public.order_items")).rows.length).toBeGreaterThan(0);
  expect((await f.asUser(users[0],()=>f.db.query("select * from public.order_items"))).rows).toEqual([]);
  const c=await client(),repo=createSupabaseResultsRepository(c);await signOutBackend(c);
  await expect(repo.listMakerResults(session,query)).rejects.toMatchObject({code:"unauthenticated"});
 });
 it("不正な期間を空の成果として成功させない",async()=>{
  const repo=createSupabaseResultsRepository(await client());
  for(const bad of [{start:"bad",end:query.end},{start:query.end,end:query.start}])await expect(repo.listMakerResults(session,bad)).rejects.toThrow("集計期間");
 });
});
