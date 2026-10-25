import assert from "node:assert/strict";
import {createHeadlessBackend,readBackendConfig,signInBackend,signOutBackend} from "@kago/backend";
import {createSupabaseStoreCallsRepository,requireStore} from "../src/lib/backend/store-calls.ts";
import {createSupabasePortalRepository,requireMaker} from "../src/lib/backend/portal.ts";
if(process.env.KAGO_ADS_ALLOW_TEST_CALL!=="1")throw Error("Set KAGO_ADS_ALLOW_TEST_CALL=1 to create and close one isolated verification call.");
const config=readBackendConfig({url:process.env.NEXT_PUBLIC_SUPABASE_URL,publishableKey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY});
const a=createHeadlessBackend(config),b=createHeadlessBackend(config),m=createHeadlessBackend(config);
let call:Awaited<ReturnType<ReturnType<typeof createSupabaseStoreCallsRepository>["saveAdCall"]>>|undefined;
const checks:string[]=[];const pass=(s:string)=>{checks.push(s);console.log("PASS "+s);};
const repo=createSupabaseStoreCallsRepository(a);
let session:{role:"store_staff";storeId:string}|undefined;
try{
 await signInBackend(a,process.env.KAGO_ADS_STORE_CHECK_EMAIL!,process.env.KAGO_ADS_STORE_CHECK_PASSWORD!,"store_staff");
 await signInBackend(b,process.env.KAGO_ADS_OTHER_STORE_EMAIL!,process.env.KAGO_ADS_OTHER_STORE_PASSWORD!,"store_staff");
 await signInBackend(m,process.env.KAGO_ADS_CHECK_EMAIL!,process.env.KAGO_ADS_CHECK_PASSWORD!,"maker_staff");
 const ai=await requireStore(a),bi=await requireStore(b),mi=await requireMaker(m);
 const storeId=process.env.KAGO_ADS_CHECK_STORE_ID||ai.storeIds[0];
 assert.ok(ai.storeIds.includes(storeId));assert.ok(!bi.storeIds.includes(storeId));
 session={role:"store_staff",storeId};const portal=createSupabasePortalRepository(m);
 const input={title:"【検証専用】ADS-02 募集公開・終了 "+new Date().toISOString(),description:"ADS-02の実接続検証。広告を承認・配信しません。",
 categories:["調味料"],channels:["app","signage"] as ("app"|"signage")[],starts_at:new Date(Date.now()-60000).toISOString(),ends_at:new Date(Date.now()+86400000).toISOString(),disclosure_scope:["impressions","signage_views"] as ("impressions"|"signage_views")[]};
 call=await repo.saveAdCall(session,input);assert.equal(call.status,"draft");pass("自店だけに検証用下書きを作成");
 assert.equal(await portal.getAdCall({role:"maker_staff",makerId:mi.makerIds[0]},call.id),undefined);pass("メーカーから下書きが見えない");
 const visible=await b.from("ad_calls").select("id").eq("id",call.id);assert.ifError(visible.error);assert.equal(visible.data?.length,0);
 const denied=await b.from("ad_calls").update({title:"RLS拒否確認"}).eq("id",call.id).select("id");
 assert.ok(denied.error||denied.data?.length===0);assert.equal((await repo.getAdCall(session,call.id))?.title,input.title);pass("別店舗の読取・変更をRLSが拒否");
 call=await repo.setAdCallStatus(session,call.id,"open",call.updated_at);assert.equal(call.status,"open");
 const publicCall=await portal.getAdCall({role:"maker_staff",makerId:mi.makerIds[0]},call.id);
 assert.equal(publicCall?.status,"open");assert.deepEqual(publicCall?.disclosure_scope,input.disclosure_scope);pass("公開募集と成果公開範囲が別メーカーセッションから読める");
 assert.ok((await portal.listPublicAdCalls()).some(c=>c.id===call!.id));pass("募集ポータル一覧へ反映");
 call=await repo.setAdCallStatus(session,call.id,"closed",call.updated_at);
 assert.equal((await portal.getAdCall({role:"maker_staff",makerId:mi.makerIds[0]},call.id))?.status,"closed");pass("終了状態がメーカー側へ反映");
 // Existing maker creative is only referenced for an INSERT expected to fail. No creative/review is changed.
 const creative=await m.from("creatives").select("id,maker_id").in("maker_id",mi.makerIds).limit(1);assert.ifError(creative.error);assert.ok(creative.data?.length);
 const c=creative.data[0],version=await m.from("creative_versions").select("id").eq("creative_id",c.id).limit(1);assert.ifError(version.error);assert.ok(version.data?.length);
 const refused=await m.from("ad_applications").insert({ad_call_id:call.id,store_id:storeId,maker_id:c.maker_id,creative_id:c.id,creative_version_id:version.data[0].id,
 channels:["app"],requested_period:"["+new Date().toISOString()+","+new Date(Date.now()+3600000).toISOString()+")"}).select("id");
 assert.equal(refused.error?.code,"23514");assert.match(refused.error?.message??"",/Ad call is not open/);pass("終了後の新規申請を正式DB制約が拒否");
 await assert.rejects(()=>repo.setAdCallStatus(session!,call!.id,"open"));pass("終了募集の再公開を拒否");
 await signOutBackend(a);await assert.rejects(()=>repo.listMyAdCalls(session!));pass("ログアウト後の募集読取を拒否");
 console.log(JSON.stringify({result:"PASS",checks:checks.length,testCallId:call.id,testCallStatus:call.status}));
}catch{console.error("ADS-02 live verification failed; inspect the isolated call with the store account.");process.exitCode=1;}
finally{
 if(call&&session&&call.status!=="closed"){
  try{if(call.status==="draft")call=await repo.setAdCallStatus(session,call.id,"open");call=await repo.setAdCallStatus(session,call.id,"closed");console.log("検証募集を終了しました。");}
  catch{console.error("検証募集の終了を確認してください。");process.exitCode=1;}
 }
 await Promise.all([a,b,m].map(c=>signOutBackend(c).catch(()=>undefined)));
}
