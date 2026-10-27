import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {createHeadlessBackend,getBackendIdentity,getAdImageUrl,signInBackend,signOutBackend} from "@kago/backend";
import {createSupabaseMakerRepository} from "../src/lib/backend/maker.ts";
assert.equal(process.env.KAGO_REGISTER_DEMO_CATALOG,"1","Explicit registration opt-in required");
assert.ok(process.env.KAGO_CONNECTION_FILE,"Private connection file required");
const raw=await readFile(process.env.KAGO_CONNECTION_FILE,"utf8");
const val=s=>{try{return JSON.parse(s.trim());}catch{return s.trim();}};
const vars=Object.fromEntries([...raw.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)].map(m=>[m[1],val(m[2])]));
function account(alias){let active=false,email="",password="";for(const line of raw.split(/\r?\n/)){
 if(line.startsWith("[")){active=new RegExp("^\\["+alias+"(?:/[^\\]]+)?\\]$").test(line);continue;}
 if(active&&line.startsWith("メール = "))email=val(line.slice("メール = ".length));
 if(active&&line.startsWith("パスワード = "))password=val(line.slice("パスワード = ".length));
}assert.ok(email&&password);return {email,password};}
const sha=data=>createHash("sha256").update(data).digest("hex");
function uuid(key){const h=sha(key);return h.slice(0,8)+"-"+h.slice(8,12)+"-5"+h.slice(13,16)+"-a"+h.slice(17,20)+"-"+h.slice(20,32);}
const catalog=JSON.parse(await readFile(new URL("../src/data/demo/ad-design-v2.json",import.meta.url),"utf8")).filter(a=>a.kind==="sponsored");
assert.equal(catalog.length,8);
const clients=[],report={schema_version:1,state:"unsubmitted",manufacturers:[]};
try{
 for(const alias of ["M1","M2"]){
  const c=createHeadlessBackend({url:vars.NEXT_PUBLIC_SUPABASE_URL,publishableKey:vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY});clients.push(c);const login=account(alias);await signInBackend(c,login.email,login.password,"maker_staff");
  const identity=await getBackendIdentity(c),membership=await c.from("maker_members").select("maker_id").eq("user_id",identity.userId);assert.ifError(membership.error);assert.equal(membership.data.length,1);
  const session={role:"maker_staff",makerId:membership.data[0].maker_id},repo=createSupabaseMakerRepository(c);
  const assets=catalog.filter(a=>a.maker_id===alias),product=await c.from("products").select("id,name").eq("code",assets[0].product_code).single();assert.ifError(product.error);assert.equal(product.data.name,assets[0].product_name);
  const listing=await c.from("store_products").select("price").eq("store_id","0da7a001-0000-4000-8000-000000000001").eq("product_id",product.data.id).single();assert.ifError(listing.error);assert.equal(listing.data.price,alias==="M1"?298:228);
  const maker=await c.from("makers").select("display_name").eq("id",session.makerId).single();assert.ifError(maker.error);
  const prepared=[];
  for(const a of assets){const bytes=await readFile(new URL("../public"+a.file,import.meta.url));prepared.push({...a,sha256:sha(bytes),bytes,upload:new Blob([bytes],{type:"image/png"})});}
  const fingerprint=sha(prepared.map(a=>a.asset_id+":"+a.sha256).sort().join("\n")),creativeId=uuid("ADS05-official-catalog-v1:"+session.makerId+":"+fingerprint);
  const designs=[...new Set(prepared.map(a=>a.creative_version))].sort((a,b)=>a-b),entries=[];
  for(const [index,design]of designs.entries()){
   const pair=prepared.filter(a=>a.creative_version===design);assert.deepEqual(pair.map(a=>a.channel).sort(),["app","signage"]);
   const media=Object.fromEntries(pair.map(a=>[a.channel,{kind:"image",path:"blob:"+a.asset_id,upload:a.upload,width:a.width,height:a.height,bytes:a.bytes.length,file_name:a.file.split("/").pop()}]));
   const input={product_id:product.data.id,headline:(alias==="M1"?"瀬戸内トマト食品":"DAILY TABLE")+"｜デモ広告・デザイン"+design,note:"ADS-05正式登録。架空メーカー。提供素材の新規版。画像内"+pair[0].embedded_price+"円"+(alias==="M2"?"は合意済み販促表現。DB通常価格を変更しない。":"。"),assets:media};
   const version=index===0?(await repo.createCreative(session,input,creativeId)).versions[0]:await repo.addCreativeVersion(session,creativeId,input,uuid(creativeId+":design:"+design));
   const repeated=index===0?(await repo.createCreative(session,input,creativeId)).versions.find(v=>v.id===version.id):await repo.addCreativeVersion(session,creativeId,input,uuid(creativeId+":design:"+design));assert.equal(repeated.id,version.id);
   for(const a of pair){const path=version.assets[a.channel]?.storage_path;assert.ok(path);const signed=await getAdImageUrl(c,path),response=await fetch(signed.url);assert.equal(response.status,200);assert.equal(sha(new Uint8Array(await response.arrayBuffer())),a.sha256);}
   entries.push({design_version:design,db_version:version.version,creative_version_id:version.id,channels:pair.map(a=>({channel:a.channel,file:a.file,sha256:a.sha256,embedded_price:a.embedded_price}))});
  }
  const reloaded=(await repo.listMyCreatives(session)).find(x=>x.creative.id===creativeId);assert.equal(reloaded.versions.length,2);
  const applications=await c.from("ad_applications").select("id").in("creative_version_id",entries.map(e=>e.creative_version_id));assert.ifError(applications.error);assert.equal(applications.data.length,0);
  report.manufacturers.push({alias,db_normal_price:listing.data.price,maker_name:maker.data.display_name,product_code:assets[0].product_code,product_name:product.data.name,creative_id:creativeId,entries});console.log("PASS "+alias+" two versions, four original images, retry-safe, unsubmitted");
 }
 await writeFile(process.env.KAGO_CATALOG_REPORT??"/tmp/kago33-catalog.json",JSON.stringify(report,null,2),{mode:0o600});
}catch(error){let message=error instanceof Error?(error.stack??error.message):String(error);const secrets=[...Object.values(vars),...[...raw.matchAll(/^(?:メール|パスワード) = (.+)$/gm)].map(m=>val(m[1]))].filter(s=>typeof s==="string"&&s.length>=6);for(const s of secrets)message=message.split(s).join("[redacted]");console.error(message.replace(/https?:\/\/\S+/g,"[URL]"));process.exitCode=1;}
finally{await Promise.all(clients.map(c=>signOutBackend(c).catch(()=>{})));}
