import {beforeAll,afterAll,describe,it,expect} from "vitest";
import {readFile} from "node:fs/promises";
import {createHeadlessBackend,signInBackend,getAdMediaPaths,getAdImageUrl} from "@kago/backend";
import {createPortalDatabase,fixturePassword,id,users} from "../../../tests/fixtures/portal-database.mts";
import {createSupabaseMakerRepository} from "./maker";
import type {CreativeInput} from "../data/repository";
describe("ADS-03 #226: 媒体別画像を本人権限で登録・審査・取得",()=>{
 let f:Awaited<ReturnType<typeof createPortalDatabase>>,app:Blob,signage:Blob;
 const maker={role:"maker_staff",makerId:id(11)} as const;
 const actor=(n:number)=>users.find(u=>u.n===n)!;
 const run=(n:number,sql:string,params:unknown[]=[])=>f.asUser(actor(n),()=>f.db.query(sql,params),true);
 const path=(m:number,c:number,a:number)=>id(m)+"/"+id(c)+"/"+id(a)+".png";
 beforeAll(async()=>{
  f=await createPortalDatabase();
  app=new Blob([await readFile(new URL("../../../public/ad-assets/design-v2/CR1_v3_app.png",import.meta.url))],{type:"image/png"});
  signage=new Blob([await readFile(new URL("../../../public/ad-assets/design-v2/CR1_v3_signage.png",import.meta.url))],{type:"image/png"});
 },30000);
 afterAll(async()=>{await f?.close();});
 async function client(n=101,fetcher=f.fetcher){
  const c=createHeadlessBackend({url:"https://fixture.supabase.co",publishableKey:"sb_publishable_fixture"},fetcher);
  await signInBackend(c,actor(n).email,fixturePassword);return c;
 }
 function input():CreativeInput{
  return {product_id:id(21),headline:"媒体別の広告",note:"同じ版",assets:{
   app:{kind:"image",path:"blob:app",upload:app,width:1254,height:1254,bytes:app.size,file_name:"app.png"},
   signage:{kind:"image",path:"blob:signage",upload:signage,width:1672,height:941,bytes:signage.size,file_name:"signage.png"}}};
 }
 const terms=(version:string)=>({creative_version_id:version,channels:["app","signage"] as ("app"|"signage")[],requested_start:"2099-01-01T00:00:00+09:00",requested_end:"2099-02-01T00:00:00+09:00",message:""});
 it("1版に異なる2画像を保存し、再送・一覧再読込でも同じ画像と版を保持する",async()=>{
  const repo=createSupabaseMakerRepository(await client()),request=id(300);
  const created=await repo.createCreative(maker,input(),request),v=created.versions[0];
  expect(v.image_error).toBeUndefined();
  expect(v.assets.app?.storage_path).not.toEqual(v.assets.signage?.storage_path);
  expect((await repo.createCreative(maker,input(),request)).versions.map(v=>v.id)).toEqual([v.id]);
  const reloaded=(await repo.listMyCreatives(maker)).find(c=>c.creative.id===request)!;
  expect(reloaded.versions[0].assets.app?.storage_path).toBe(v.assets.app?.storage_path);
  expect(reloaded.versions[0].assets.signage?.storage_path).toBe(v.assets.signage?.storage_path);
  expect((await f.db.query<{image_paths:unknown}>("select image_paths from creative_versions where id=$1",[v.id])).rows[0].image_paths).toEqual({app:v.assets.app?.storage_path,signage:v.assets.signage?.storage_path});
  expect((await f.db.query("select name from storage.objects where name like $1",[id(11)+"/"+request+"/%"])).rows).toHaveLength(2);
 });
 it("Appだけの版ではSignage申請を画面のデータ層・DBの両方で拒否する",async()=>{
  const repo=createSupabaseMakerRepository(await client()),value=input();delete value.assets.signage;
  const created=await repo.createCreative(maker,value,id(301)),v=created.versions[0];
  expect(v.assets.app).toBeDefined();expect(v.assets.signage).toBeUndefined();
  await expect(repo.submitApplication(maker,id(31),{...terms(v.id),channels:["signage"]})).rejects.toThrow("Signage");
  await expect(run(101,"insert into ad_applications(ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period) values($1,$2,$3,$4,$5,array['signage'],'[2099-01-01,2099-02-01)')",[id(31),id(1),id(11),created.creative.id,v.id])).rejects.toMatchObject({code:"23514"});
  expect((await repo.submitApplication(maker,id(31),{...terms(v.id),channels:["app"]})).channels).toEqual(["app"]);
 });
 it("審査者は両画像を読めるが、Appだけの承認では端末は画像を読めない",async()=>{
  const repo=createSupabaseMakerRepository(await client()),v=(await repo.createCreative(maker,input(),id(302))).versions[0];
  const submitted=await repo.submitApplication(maker,id(31),terms(v.id)),reviewer=await client(104);
  expect((await getAdMediaPaths(reviewer,[{id:v.id,image_path:"unused"}])).paths.get(v.id)).toEqual({app:v.assets.app!.storage_path,signage:v.assets.signage!.storage_path});
  await getAdImageUrl(reviewer,v.assets.app!.storage_path!);await getAdImageUrl(reviewer,v.assets.signage!.storage_path!);
  await run(104,"select * from kago_approve_application($1,1,null,null,array['app'])",[submitted.id]);
  const customer=await client(105),device=await client(106);
  expect((await getAdMediaPaths(customer,[{id:v.id,image_path:"unused"}])).paths.get(v.id)).toEqual({app:v.assets.app!.storage_path});
  expect((await getAdMediaPaths(device,[{id:v.id,image_path:"unused"}])).paths.get(v.id)).toEqual({});
  await getAdImageUrl(customer,v.assets.app!.storage_path!);
  await expect(getAdImageUrl(customer,v.assets.signage!.storage_path!)).rejects.toBeTruthy();
  await expect(getAdImageUrl(device,v.assets.signage!.storage_path!)).rejects.toBeTruthy();
  await expect(getAdImageUrl(await client(102),v.assets.app!.storage_path!)).rejects.toBeTruthy();
 });
 it("両媒体を承認した版は利用者にはApp画像、端末にはSignage画像だけを返す",async()=>{
  const repo=createSupabaseMakerRepository(await client()),v=(await repo.createCreative(maker,input(),id(303))).versions[0];
  const a=await repo.submitApplication(maker,id(31),terms(v.id));
  await run(104,"select * from kago_approve_application($1,1,null,null,array['app','signage'])",[a.id]);
  for(const [n,channel,denied] of [[105,"app","signage"],[106,"signage","app"]] as const){
   const c=await client(n);
   expect((await getAdMediaPaths(c,[{id:v.id,image_path:"unused"}])).paths.get(v.id)).toEqual({[channel]:v.assets[channel]!.storage_path});
   await getAdImageUrl(c,v.assets[channel]!.storage_path!);
   await expect(getAdImageUrl(c,v.assets[denied]!.storage_path!)).rejects.toBeTruthy();
  }
  const placement=(await f.db.query<{id:string}>("select id from ad_placements where application_id=$1",[a.id])).rows[0].id;
  await run(104,"select * from kago_suspend_placement($1,$2)",[placement,"停止"]);
  expect((await getAdMediaPaths(await client(106),[{id:v.id,image_path:"unused"}])).paths.get(v.id)).toEqual({});
 });
 it("他社・別素材のパス、不正なキー・値・空オブジェクト・既存版の変更を拒否する",async()=>{
  const legacy=path(11,51,53);
  for(const paths of [{app:path(12,52,54)},{app:path(11,999,53)},{other:legacy},{app:null},{app:"https://example.test/a.png"},{},[]]){
   await expect(run(101,"insert into creative_versions(creative_id,version,image_path,image_paths,headline) values($1,2,$2,$3::jsonb,'拒否')",[id(51),legacy,JSON.stringify(paths)])).rejects.toMatchObject({code:"23514"});
  }
  await expect(run(101,"update creative_versions set image_paths=$2::jsonb where id=$1",[id(53),JSON.stringify({app:legacy})])).rejects.toBeTruthy();
 });
 it("旧スキーマでは共通画像を保持し、媒体別登録は業務行の作成前に止める",async()=>{
  const old:typeof fetch=async(input,init)=>{
   const url=new URL(String(input));
   if(url.pathname.endsWith("/rpc/kago_ad_media_paths")||(url.searchParams.get("select")??"").includes("image_paths"))
    return new Response(JSON.stringify({code:url.pathname.includes("/rpc/")?"PGRST202":"PGRST204"}),{status:404,headers:{"content-type":"application/json"}});
   return f.fetcher(input,init);
  };
  const repo=createSupabaseMakerRepository(await client(101,old));
  const legacy=(await repo.listMyCreatives(maker)).find(c=>c.creative.id===id(51))!.versions[0];
  expect(legacy.assets.app?.storage_path).toBe(legacy.assets.signage?.storage_path);
  await expect(repo.createCreative(maker,input(),id(305))).rejects.toThrow("媒体別画像");
  expect((await f.db.query("select id from creatives where id=$1",[id(305)])).rows).toEqual([]);
  const value=input();value.assets.signage=value.assets.app;
  const common=await repo.createCreative(maker,value,id(306));
  expect(common.versions[0].assets.app?.storage_path).toBe(common.versions[0].assets.signage?.storage_path);
 });
 it("新RPCが未適用の場合のみ旧方式へ戻り、権限・通信の失敗は握りつぶさない",async()=>{
  const missing:typeof fetch=async(input,init)=>String(input).includes("/rpc/kago_ad_media_paths")
   ?new Response(JSON.stringify({code:"PGRST202"}),{status:404,headers:{"content-type":"application/json"}}):f.fetcher(input,init);
  const c=await client(101,missing),legacy=path(11,51,53);
  expect((await getAdMediaPaths(c,[{id:id(53),image_path:legacy}])).paths.get(id(53))).toEqual({app:legacy,signage:legacy});
  const newer=await createSupabaseMakerRepository(await client()).createCreative(maker,input(),id(304));
  const v=newer.versions[0];
  expect((await getAdMediaPaths(c,[{id:v.id,image_path:v.assets.signage!.storage_path!}])).paths.get(v.id)).toEqual({app:v.assets.app!.storage_path,signage:v.assets.signage!.storage_path});
  const broken:typeof fetch=async(input,init)=>String(input).includes("/rpc/kago_ad_media_paths")
   ?new Response(JSON.stringify({code:"42501"}),{status:403,headers:{"content-type":"application/json"}}):f.fetcher(input,init);
  await expect(getAdMediaPaths(await client(101,broken),[])).rejects.toMatchObject({code:"42501"});
 });
});
