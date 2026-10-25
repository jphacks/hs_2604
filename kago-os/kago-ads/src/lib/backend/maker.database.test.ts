import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createHeadlessBackend, signInBackend, signOutBackend } from "@kago/backend";
import { createPortalDatabase, fixturePassword, id, users } from "../../../tests/fixtures/portal-database.mts";
import { createSupabaseMakerRepository } from "./maker";
import { deliveryState } from "../domain/rules";
import type { CreativeInput, ApplicationInput } from "../data/repository";
const session={role:"maker_staff",makerId:id(11)} as const;
const otherSession={role:"maker_staff",makerId:id(12)} as const;
const period={requested_start:"2099-01-01T00:00:00+09:00",requested_end:"2099-02-01T00:00:00+09:00"};
describe("ADS-03 正式migration・Storage権限・申請履歴",()=>{
 let f:Awaited<ReturnType<typeof createPortalDatabase>>,image:Blob;
 beforeAll(async()=>{f=await createPortalDatabase();image=new Blob([await readFile(new URL("../../../public/ad-assets/CR1_v1_app.png",import.meta.url))],{type:"image/png"});},30_000);
 afterAll(async()=>{await f?.close();});
 async function client(n=101,fetcher=f.fetcher){
  const c=createHeadlessBackend({url:"https://fixture.supabase.co",publishableKey:"sb_publishable_fixture"},fetcher);
  await signInBackend(c,users.find(u=>u.n===n)!.email,fixturePassword);return c;
 }
 const creativeInput=(headline:string):CreativeInput=>({product_id:id(21),headline,note:"初版",assets:{app:{kind:"image",path:"blob:fixture",upload:image,width:800,height:800,bytes:image.size,file_name:"ad.png"}}});
 const application=(version:string):ApplicationInput=>({creative_version_id:version,channels:["app","signage"],...period,message:"検証用"});
 async function review(app:string,rev:number,action:"approve"|"reject"){
   return f.asUser(users.find(u=>u.n===104)!,()=>action==="reject"
    ?f.db.query("select * from public.kago_reject_application($1,$2,$3)",[app,rev,"商品名を大きくしてください"])
    :f.db.query("select * from public.kago_approve_application($1,$2,null,null,array['app'])",[app,rev]),true);
 }
 it("自社素材・各版・自社申請・DB履歴だけを取得し、画像URLを発行する",async()=>{
  const repo=createSupabaseMakerRepository(await client());
  const own=await repo.listMyCreatives(session);
  expect(own.map(c=>c.creative.id)).toEqual([id(51)]);
  expect(own[0].versions[0].assets.app?.path).toContain("/storage/v1/object/sign/");
  expect(own[0].versions[0].assets.app?.storage_path).toBe(id(11)+"/"+id(51)+"/"+id(53)+".png");
  const apps=await repo.listMyApplications(session);expect(apps.map(a=>a.id)).toEqual([id(61)]);
  expect(apps[0].revisions[0].rev).toBe(1);
  expect(await repo.getApplication(session,id(62))).toBeUndefined();
  expect(await repo.listPlacements(session,id(62))).toEqual([]);
 });
 it("所属の詐称・他社素材の新版作成・別役割・所属なしを拒否する",async()=>{
  const repo=createSupabaseMakerRepository(await client());
  await expect(repo.listMyCreatives(otherSession)).rejects.toMatchObject({code:"forbidden"});
  await expect(repo.addCreativeVersion(session,id(52),creativeInput("改変"))).rejects.toMatchObject({code:"forbidden"});
  for(const n of [103,104,105])await expect(createSupabaseMakerRepository(await client(n)).listMyApplications(session)).rejects.toMatchObject({code:"forbidden"});
 });
 it("画像形式・複数画像・メモ長を検証してから業務行を作る",async()=>{
  const repo=createSupabaseMakerRepository(await client());
  const input=creativeInput("不正");
  await expect(repo.createCreative(session,{...input,assets:{app:{...input.assets.app!,upload:new Blob(["bad"],{type:"image/png"})}}},id(210))).rejects.toThrow("PNG");
  await expect(repo.createCreative(session,{...input,note:"a".repeat(501)},id(211))).rejects.toThrow("500");
  await expect(repo.createCreative(session,{...input,assets:{app:input.assets.app,signage:{...input.assets.app!,path:"blob:another"}}},id(212))).rejects.toThrow("1枚");
  expect((await f.db.query("select id from creatives where id in ($1,$2,$3)",[id(210),id(211),id(212)])).rows).toEqual([]);
 });
 it("画像登録→申請→却下→新版→再申請→承認→承認後の差替え→停止を2役で確認する",async()=>{
  const c=await client(),repo=createSupabaseMakerRepository(c);
  const input=creativeInput("最初の広告");
  const registered=await repo.createCreative(session,{...input,maker_id:id(12)} as CreativeInput,id(220));
  expect(registered.creative.maker_id).toBe(id(11));
  const v1=registered.versions[0];
  expect(v1.image_error).toBeUndefined();
  expect(v1.assets.app?.storage_path).not.toMatch(/https:|\?/);
  const retry=await repo.createCreative(session,input,id(220));
  expect(retry.creative.id).toBe(registered.creative.id);expect(retry.versions).toHaveLength(1);
  const app=await repo.submitApplication(session,id(31),{...application(v1.id),status:"approved",store_id:id(2)} as ApplicationInput);
  expect(app.store_id).toBe(id(1));expect(app.status).toBe("submitted");expect(app.revisions).toHaveLength(1);
  await expect(f.asUser(users[0],()=>f.db.query("select * from public.kago_approve_application($1,1)",[app.id]),true)).rejects.toMatchObject({code:"42501"});
  await expect(repo.resubmitApplication(session,app.id,application(v1.id))).rejects.toThrow("審査中");
  const visible=await f.asUser(users.find(u=>u.n===104)!,()=>f.db.query("select id from ad_applications where id=$1",[app.id]));
  expect(visible.rows).toHaveLength(1);
  await review(app.id,1,"reject");
  const rejected=(await repo.getApplication(session,app.id))!;
  expect(rejected.review_comment).toBe("商品名を大きくしてください");
  const v2=await repo.addCreativeVersion(session,registered.creative.id,creativeInput("商品名を大きくした広告"),id(221));
  expect(v2.version).toBe(2);expect(v2.assets.app?.storage_path).not.toBe(v1.assets.app?.storage_path);
  const resubmitted=await repo.resubmitApplication(session,app.id,application(v2.id),rejected.updated_at);
  expect(resubmitted.id).toBe(app.id);expect(resubmitted.revisions.map(r=>r.status)).toEqual(["rejected","submitted"]);
  expect(resubmitted.review_comment).toBeUndefined();
  expect(resubmitted.revisions[0].review_comment).toBe(rejected.review_comment);
  await review(app.id,2,"approve");
  const firstPlacement=(await repo.listPlacements(session,app.id))[0];
  expect(firstPlacement.channels).toEqual(["app"]);expect(firstPlacement.creative_version_id).toBe(v2.id);
  const v3=await repo.addCreativeVersion(session,registered.creative.id,{headline:"次の広告",note:"見出しだけ変更",assets:v2.assets},id(222));
  const approved=(await repo.getApplication(session,app.id))!;
  await repo.resubmitApplication(session,app.id,application(v3.id),approved.updated_at);
  expect((await repo.listPlacements(session,app.id)).find(p=>p.id===firstPlacement.id)?.status).toBe("active");
  await review(app.id,3,"approve");
  const placements=await repo.listPlacements(session,app.id);
  expect(placements.find(p=>p.id===firstPlacement.id)?.status).toBe("superseded");
  const active=placements.find(p=>p.status==="active")!;expect(active.creative_version_id).toBe(v3.id);
  await f.asUser(users.find(u=>u.n===104)!,()=>f.db.query("select * from public.kago_suspend_placement($1,$2)",[active.id,"検証のため停止"]),true);
  const stopped=(await repo.listPlacements(session,app.id)).find(p=>p.id===active.id)!;
  expect(stopped.suspend_reason).toBe("検証のため停止");expect(stopped.suspended_by).toBe(id(104));expect(stopped.suspended_at).toBeTruthy();
  expect(deliveryState([stopped],"app").state).toBe("suspended");
  const histories=await repo.getApplication(session,app.id);expect(histories?.revisions.map(r=>r.rev)).toEqual([1,2,3]);
  const versions=(await repo.listMyCreatives(session)).find(x=>x.creative.id===registered.creative.id)!.versions;
  expect(versions.map(v=>v.headline)).toEqual(["最初の広告","商品名を大きくした広告","次の広告"]);
 });
 it("終了募集・対象外商品・重複申請・不正な掲載先を拒否する",async()=>{
  const repo=createSupabaseMakerRepository(await client());
  await expect(repo.submitApplication(session,id(32),application(id(53)))).rejects.toThrow("終了");
  await expect(repo.submitApplication(session,id(31),application(id(53)))).rejects.toThrow("すでに");
  await expect(repo.submitApplication(session,id(34),{...application(id(53)),channels:["app"]})).rejects.toThrow("募集していません");
  await expect(repo.submitApplication(session,id(34),{...application(id(53)),channels:["signage","signage"]})).rejects.toThrow("掲載先");
  const c=await repo.createCreative(session,{...creativeInput("非取扱商品"),product_id:id(22)},id(230));
  await expect(repo.submitApplication(session,id(31),application(c.versions[0].id))).rejects.toThrow("取り扱われていません");
 });
 it("競合した再申請で履歴を増やさず、先に保存した申請を保持する",async()=>{
  const plain=createSupabaseMakerRepository(await client());
  const created=await plain.createCreative(session,creativeInput("競合検証"),id(240));
  const app=await plain.submitApplication(session,id(31),application(created.versions[0].id));
  await review(app.id,1,"reject");
  const snapshot=(await plain.getApplication(session,app.id))!;
  let race=true;
  const wrapped:typeof fetch=async(input,init)=>{
    if(race && init?.method==="PATCH" && String(input).includes("/ad_applications")){
      race=false;await plain.resubmitApplication(session,app.id,{...application(created.versions[0].id),message:"先に保存"},snapshot.updated_at);
    }
    return f.fetcher(input,init);
  };
  const repo=createSupabaseMakerRepository(await client(101,wrapped));
  await expect(repo.resubmitApplication(session,app.id,{...application(created.versions[0].id),message:"古い画面"},snapshot.updated_at)).rejects.toThrow("更新されています");
  expect((await plain.getApplication(session,app.id))?.revisions).toHaveLength(2);
  expect((await plain.getApplication(session,app.id))?.revisions[1].message).toBe("先に保存");
 });
 it("正式RLSが他社画像・素材上書き・履歴改変・直接承認を拒否する",async()=>{
  const maker=users[0],foreign=users[1];
  const changed=await f.asUser(maker,()=>f.db.query("update storage.objects set name='replace' returning id"));
  expect(changed.rows).toEqual([]);
  const deleted=await f.asUser(maker,()=>f.db.query("delete from storage.objects returning id"));expect(deleted.rows).toEqual([]);
  await expect(f.asUser(foreign,()=>f.db.query("insert into storage.objects(bucket_id,name) values ('ad-images',$1)",[id(11)+"/"+id(51)+"/"+id(700)+".png"]))).rejects.toMatchObject({code:"42501"});
  await expect(f.asUser(maker,()=>f.db.query("update creative_versions set headline='改変' where id=$1",[id(53)]))).rejects.toBeTruthy();
  await expect(f.asUser(maker,()=>f.db.query("update application_revisions set message='改変' where application_id=$1",[id(61)]))).rejects.toBeTruthy();
  await expect(f.asUser(maker,()=>f.db.query("update ad_applications set status='approved' where id=$1",[id(61)]))).rejects.toBeTruthy();
  const client2=await client(102);await expect(createSupabaseMakerRepository(client2).submitApplication(otherSession,id(34),application(id(53)))).rejects.toMatchObject({code:"forbidden"});
 });
 it("画像保存の前提関数がAPIへ未反映なら業務行を作らない",async()=>{
  const fetcher:typeof fetch=async(input,init)=>String(input).includes("/rpc/kago_ad_image_path_valid")
    ?new Response(JSON.stringify({code:"PGRST202"}),{status:404,headers:{"content-type":"application/json"}}):f.fetcher(input,init);
  const repo=createSupabaseMakerRepository(await client(101,fetcher));
  await expect(repo.createCreative(session,creativeInput("未適用の確認"),id(250))).rejects.toThrow("COM-03");
  expect((await f.db.query("select id from creatives where id=$1",[id(250)])).rows).toEqual([]);
 });
 it("ログアウト後は素材・申請・署名URLを再取得できない",async()=>{
  const c=await client(),repo=createSupabaseMakerRepository(c);
  await signOutBackend(c);
  await expect(repo.listMyCreatives(session)).rejects.toMatchObject({code:"unauthenticated"});
  await expect(repo.listMyApplications(session)).rejects.toMatchObject({code:"unauthenticated"});
 });
});
