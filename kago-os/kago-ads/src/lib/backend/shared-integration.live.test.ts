import {it} from "vitest";
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {createHash,randomUUID} from "node:crypto";
import {createHeadlessBackend,getBackendIdentity,getAdMediaPaths,getAdImageUrl,signInBackend,signOutBackend} from "@kago/backend";
import {createSupabaseMakerRepository} from "./maker";
import {createSupabaseStoreCallsRepository,requireStore} from "./store-calls";
import {loadSignageFeed,requireDevice,insertSignagePlays} from "./signage";
import {startPlay,endPlay} from "../signage/plays";
import {selectCrowdAd} from "../signage/crowd-selection";

it.skipIf(process.env.KAGO_SHARED_INTEGRATION!=="1")("TEST-01 #241: 共有Supabaseの媒体別画像・審査・配信・合成記録",async()=>{
 assert.ok(process.env.KAGO_CONNECTION_FILE,"Private connection file path is required");
 const text=await readFile(process.env.KAGO_CONNECTION_FILE!,"utf8");
 const value=(s:string)=>{s=s.trim();if(s.startsWith('"')){try{return JSON.parse(s) as string;}catch{/* unquoted original */}}return s.replace(/^'|'$/g,"");};
 const env=Object.fromEntries([...text.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)].map(m=>[m[1],value(m[2])]));
 const accounts:Record<string,{email:string;password:string}>={};let current:string|undefined;
 for(const line of text.split(/\r?\n/)){
  const m=line.match(/^\[(U[12]|T[12]|M[12]|DV[123])(?:\/[^\]]+)?\]$/);
  if(m){current=m[1];accounts[current]={email:"",password:""};continue;}
  if(line.startsWith("[")){current=undefined;continue;}
  if(current&&line.startsWith("メール = "))accounts[current].email=value(line.slice("メール = ".length));
  if(current&&line.startsWith("パスワード = "))accounts[current].password=value(line.slice("パスワード = ".length));
 }
 const config={url:env.NEXT_PUBLIC_SUPABASE_URL,publishableKey:env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY};
 const clients:ReturnType<typeof createHeadlessBackend>[]=[];
 const log:{checks:string[];ids:Record<string,string>;status:string}={checks:[],ids:{},status:"running"};
 const output=process.env.KAGO_SHARED_REPORT??"/tmp/kago241-live.json";
 async function login(alias:string){
  const credential=accounts[alias];assert.ok(credential?.email&&credential?.password,"Missing fixture account "+alias);
  const c=createHeadlessBackend(config);clients.push(c);
  await signInBackend(c,credential.email,credential.password);return c;
 }
 async function check(label:string){log.checks.push(label);await persist();console.log("PASS "+label);}
 async function persist(){await writeFile(output,JSON.stringify(log,null,2),{mode:0o600});}
 const [maker,otherMaker,store,otherStore,customer,device,otherDevice]=await Promise.all(["M1","M2","T1","T2","U1","DV1","DV3"].map(login));
 const storeRepo=createSupabaseStoreCallsRepository(store),makerRepo=createSupabaseMakerRepository(maker);
 const storeIdentity=await requireStore(store),identity=await getBackendIdentity(maker),deviceSession=await requireDevice(device),foreignSession=await requireDevice(otherDevice);
 const {data:members,error:memberError}=await maker.from("maker_members").select("maker_id").eq("user_id",identity.userId);assert.ifError(memberError);assert.equal(members?.length,1);
 const makerSession={role:"maker_staff" as const,makerId:members![0].maker_id},storeSession={role:"store_staff" as const,storeId:deviceSession.storeId};
 assert.ok(storeIdentity.storeIds.includes(storeSession.storeId));assert.notEqual(foreignSession.storeId,storeSession.storeId);
 let placement:string|undefined,callId:string|undefined;
 try{
  const {data:products,error}=await store.from("products").select("id,category").eq("code","2900000000162");assert.ifError(error);assert.equal(products?.length,1);
  const product=products![0];
  const {data:stock,error:stockError}=await store.from("store_products").select("product_id").eq("store_id",storeSession.storeId).eq("product_id",product.id).eq("is_active",true);assert.ifError(stockError);assert.equal(stock?.length,1);
  const starts=new Date(Date.now()-60000).toISOString(),ends=new Date(Date.now()+3600000).toISOString();
  let call=await storeRepo.saveAdCall(storeSession,{title:"共有接続検証 #241 "+new Date().toISOString(),description:"検証用。終了後は募集を終了します。",categories:[product.category],channels:["app","signage"],starts_at:starts,ends_at:ends,disclosure_scope:["impressions"]});
  callId=call.id;log.ids.call=call.id;await persist();
  call=await storeRepo.setAdCallStatus(storeSession,call.id,"open",call.updated_at);
  await check("store_create_publish_call");
  const source=new URL("../../../public/ad-assets/design-v2/",import.meta.url);
  const asset=async(file:string)=>{const bytes=await readFile(new URL(file,source));return {kind:"image" as const,path:"blob:"+file,upload:new Blob([bytes],{type:"image/png"}),width:0,height:0,bytes:bytes.length,file_name:file};};
  const input={product_id:product.id,headline:"媒体別共有検証 #241",note:"共有APIでの実接続確認",assets:{app:await asset("CR1_v3_app.png"),signage:await asset("CR1_v3_signage.png")}};
  const request=randomUUID(),creative=await makerRepo.createCreative(makerSession,input,request),v1=creative.versions[0];
  log.ids.creative=creative.creative.id;log.ids.version1=v1.id;await persist();
  assert.ok(v1.assets.app?.storage_path&&v1.assets.signage?.storage_path);assert.notEqual(v1.assets.app.storage_path,v1.assets.signage.storage_path);
  assert.equal((await makerRepo.createCreative(makerSession,input,request)).versions[0].id,v1.id);
  const reload=(await makerRepo.listMyCreatives(makerSession)).find(c=>c.creative.id===creative.creative.id)!;
  assert.equal(reload.versions[0].assets.app?.storage_path,v1.assets.app.storage_path);assert.equal(reload.versions[0].assets.signage?.storage_path,v1.assets.signage.storage_path);
  await check("two_images_save_reload_idempotent");
  await getAdImageUrl(store,v1.assets.app.storage_path).then(()=>assert.fail("Unsubmitted version must not be available to store"),()=>{});
  let application=await makerRepo.submitApplication(makerSession,call.id,{creative_version_id:v1.id,channels:["app","signage"],requested_start:starts,requested_end:ends,message:"#241検証用"});
  log.ids.application=application.id;await persist();
  await getAdImageUrl(store,v1.assets.app.storage_path);await getAdImageUrl(store,v1.assets.signage.storage_path);
  await assert.rejects(getAdImageUrl(otherStore,v1.assets.app.storage_path));
  await assert.rejects(getAdImageUrl(otherMaker,v1.assets.app.storage_path));
  const reject=await store.rpc("kago_reject_application",{p_application_id:application.id,p_expected_revision:1,p_reason:"#241 再申請の検証"});assert.ifError(reject.error);
  await check("review_both_images_isolation_reject");
  const appOnly=await makerRepo.addCreativeVersion(makerSession,creative.creative.id,{headline:input.headline,note:"Appだけの新版",assets:{app:await asset("CR1_v4_app.png")}});
  log.ids.version2=appOnly.id;
  await assert.rejects(makerRepo.resubmitApplication(makerSession,application.id,{creative_version_id:appOnly.id,channels:["signage"],requested_start:starts,requested_end:ends,message:"拒否される確認"}));
  application=await makerRepo.resubmitApplication(makerSession,application.id,{creative_version_id:appOnly.id,channels:["app"],requested_start:starts,requested_end:ends,message:"Appのみ"});
  const approveApp=await store.rpc("kago_approve_application",{p_application_id:application.id,p_expected_revision:2,p_channels:["app"]});assert.ifError(approveApp.error);placement=approveApp.data![0].placement_id;
  assert.equal((await getAdMediaPaths(device,[{id:appOnly.id,image_path:appOnly.assets.app!.storage_path!}])).paths.get(appOnly.id)?.signage,undefined);
  await getAdImageUrl(customer,appOnly.assets.app!.storage_path!);
  await check("missing_channel_denied_app_only_approval");
  const v3=await makerRepo.addCreativeVersion(makerSession,creative.creative.id,{headline:input.headline,note:"両媒体へ再申請",assets:{app:appOnly.assets.app,signage:v1.assets.signage}});
  log.ids.version3=v3.id;
  application=await makerRepo.resubmitApplication(makerSession,application.id,{creative_version_id:v3.id,channels:["app","signage"],requested_start:starts,requested_end:ends,message:"両媒体"});
  const approved=await store.rpc("kago_approve_application",{p_application_id:application.id,p_expected_revision:3,p_channels:["app","signage"]});assert.ifError(approved.error);placement=approved.data![0].placement_id;log.ids.placement=placement!;await persist();
  const appPath=v3.assets.app!.storage_path!,signagePath=v3.assets.signage!.storage_path!;
  const digest=(data:Uint8Array)=>createHash("sha256").update(data).digest("hex");
  for(const [c,path,file,denied] of [[customer,appPath,"CR1_v4_app.png",signagePath],[device,signagePath,"CR1_v3_signage.png",appPath]] as const){
   const signed=await getAdImageUrl(c,path);const response=await fetch(signed.url);assert.equal(response.status,200);
   assert.equal(digest(new Uint8Array(await response.arrayBuffer())),digest(await readFile(new URL(file,source))));
   await assert.rejects(getAdImageUrl(c,denied));
  }
  await check("customer_app_device_signage_actual_bytes");
  const feed=await loadSignageFeed(device,deviceSession,new Date());
  const item=feed.items.find(i=>i.ad_placement_id===placement);assert.ok(item);assert.equal(item.asset.path,signagePath);
  assert.ok(!(await loadSignageFeed(otherDevice,foreignSession,new Date())).items.some(i=>i.ad_placement_id===placement));
  const now=new Date(),play=endPlay({...startPlay(deviceSession.deviceId,item,"no_content",now.toISOString()),data_origin:"synthetic"},new Date(now.getTime()+4000).toISOString(),"completed");
  log.ids.synthetic_play=play.id;await persist();
  assert.deepEqual(await insertSignagePlays(device,deviceSession,[play]),{rejected:[]});
  assert.deepEqual(await insertSignagePlays(device,deviceSession,[play]),{rejected:[]});
  const plays=await store.from("signage_plays").select("id,data_origin").eq("id",play.id);assert.ifError(plays.error);assert.equal(plays.data?.length,1);assert.equal(plays.data?.[0].data_origin,"synthetic");
  const deniedPlay=await otherDevice.from("signage_plays").insert({...play,id:randomUUID()});assert.ok(deniedPlay.error);
  await check("signage_feed_synthetic_play_retry_other_device_denied");
  const crowd=await device.rpc("kago_signage_crowd");assert.ifError(crowd.error);assert.equal(crowd.data.store_id,storeSession.storeId);
  const allowed=["schema_version","store_id","data_origin","observed_at","expires_at","sample_size","categories"].sort();assert.deepEqual(Object.keys(crowd.data).sort(),allowed);
  if(crowd.data.sample_size<5){assert.equal(crowd.data.sample_size,0);assert.deepEqual(crowd.data.categories,[]);}
  for(const c of [maker,store,customer])assert.equal((await c.rpc("kago_signage_crowd")).error?.code,"42501");
  const crowdFeed=await loadSignageFeed(device,deviceSession,new Date(),true);assert.ok(crowdFeed.crowd?.snapshot);
  const decision=selectCrowdAd(crowdFeed,crowdFeed.crowd!.categoryByKey,crowdFeed.crowd!.snapshot,new Date());assert.ok(decision.reason_code.startsWith("crowd_"));
  await check("crowd_api_exact_schema_suppression_role_denials");
  await store.rpc("kago_suspend_placement",{p_placement_id:placement,p_reason:"#241 検証終了"});
  assert.ok(!(await loadSignageFeed(device,deviceSession)).items.some(i=>i.ad_placement_id===placement));
  await assert.rejects(getAdImageUrl(customer,appPath));await assert.rejects(getAdImageUrl(device,signagePath));
  await check("suspend_refresh_and_new_signed_url_denied");
  await signOutBackend(maker);await assert.rejects(makerRepo.listMyCreatives(makerSession));
  await check("logout_denied");
  log.status="PASS";
 }finally{
  if(placement){const stopped=await store.rpc("kago_suspend_placement",{p_placement_id:placement,p_reason:"#241 検証終了"});assert.ifError(stopped.error);}
  if(callId){const latest=await storeRepo.getAdCall(storeSession,callId);if(latest?.status==="open")await storeRepo.setAdCallStatus(storeSession,callId,"closed",latest.updated_at);}
  await persist();await Promise.all(clients.map(c=>signOutBackend(c).catch(()=>{})));
 }
},180000);
