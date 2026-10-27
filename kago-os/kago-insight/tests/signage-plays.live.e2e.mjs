import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
import {createHeadlessBackend,signInBackend,signOutBackend} from "@kago/backend";
assert.equal(process.env.KAGO_PLAYS_LIVE,"1","Explicit live-read opt-in required");
assert.ok(process.env.KAGO_CONNECTION_FILE,"Private connection file required");
const raw=await readFile(process.env.KAGO_CONNECTION_FILE,"utf8");
const value=s=>{try{return JSON.parse(s.trim());}catch{return s.trim();}};
const vars=Object.fromEntries([...raw.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)].map(m=>[m[1],value(m[2])]));
function account(alias){let active=false,email="",password="";for(const line of raw.split(/\r?\n/)){
 if(line.startsWith("[")){active=new RegExp("^\\["+alias+"(?:/[^\\]]+)?\\]$").test(line);continue;}
 if(active&&line.startsWith("メール = "))email=value(line.slice("メール = ".length));
 if(active&&line.startsWith("パスワード = "))password=value(line.slice("パスワード = ".length));
}assert.ok(email&&password);return {email,password};}
const root=fileURLToPath(new URL("../",import.meta.url)),base="http://127.0.0.1:3296";
const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:vars.NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,NEXT_PUBLIC_INSIGHT_DATA_SOURCE:"supabase",NEXT_PUBLIC_INSIGHT_BASE_PATH:""};
delete env.KAGO_DEMO_STORE_EMAIL;delete env.KAGO_DEMO_STORE_PASSWORD;
const config={url:env.NEXT_PUBLIC_SUPABASE_URL,publishableKey:env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY};
const store=createHeadlessBackend(config),device=createHeadlessBackend(config);let server,browser;
async function poll(fn){for(let i=0;i<150;i++){if(await fn())return;await new Promise(r=>setTimeout(r,300));}throw Error("Condition timed out");}
try{
 await signInBackend(store,account("T1").email,account("T1").password,"store_staff");
 await signInBackend(device,account("DV1").email,account("DV1").password,"signage");
 const devices=await store.from("signage_devices").select("id");assert.ifError(devices.error);assert.ok(devices.data.length);
 const latest=await store.from("signage_plays").select("id,creative_version_id,reason_code").in("device_id",devices.data.map(d=>d.id)).eq("mode","schedule").eq("data_origin","operated").not("creative_version_id","is",null).order("started_at",{ascending:false}).limit(1);
 assert.ifError(latest.error);assert.equal(latest.data.length,1,"A completed normal ad play is required");const target=latest.data[0];
 for(const table of ["orders","order_items","customer_settings","events"]){const q=await device.from(table).select("*").limit(1);assert.ok(q.error?.code==="42501"||(!q.error&&q.data.length===0),"Device must not read personal data");}
 console.log("PASS real_device_cannot_read_purchase_settings_or_events");
 if(process.env.KAGO_E2E_SKIP_BUILD!=="1")await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[root+"node_modules/next/dist/bin/next","build"],{cwd:root,env,stdio:"ignore"});p.on("error",reject);p.on("exit",n=>n===0?resolve():reject(Error("Build failed")));});
 server=spawn(process.execPath,[root+"node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3296"],{cwd:root,env,stdio:"ignore"});
 await poll(async()=>{if(server.exitCode!==null)throw Error("Server exited");try{return(await fetch(base+"/login")).ok;}catch{return false;}});
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH??"/usr/bin/google-chrome",headless:true});
 async function open(alias){
  const c=await browser.newContext({viewport:{width:390,height:844},permissions:[]}),p=await c.newPage();
  await p.goto(base+"/signage-decisions");await p.locator('input[name="email"]').fill(account(alias).email);await p.locator('input[name="password"]').fill(account(alias).password);
  await p.getByRole("button",{name:"ログイン",exact:true}).click();await p.getByRole("heading",{name:"通常再生の履歴",exact:true}).waitFor({timeout:45000});return {c,p};
 }
 const own=await open("T1"),row=own.p.getByTestId("signage-play").filter({hasText:target.id});await row.waitFor();
 assert.match(await row.textContent(),new RegExp(target.reason_code));assert.ok((await row.textContent()).includes(target.creative_version_id));
 await row.getByText("再生ID・素材版を確認",{exact:true}).click();await row.getByText("素材版ID："+target.creative_version_id,{exact:true}).waitFor();
 assert.match(await own.p.locator("body").innerText(),/人による視認を示すものではありません/);
 assert.ok(await own.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 console.log("PASS own_store_real_play_reason_version_and_mobile_layout");
 const foreign=await open("T2");assert.equal(await foreign.p.getByTestId("signage-play").filter({hasText:target.id}).count(),0);
 console.log("PASS other_store_does_not_render_play");
 const anon=await browser.newContext(),p=await anon.newPage();await p.goto(base+"/signage-decisions");await p.locator('input[name="email"]').waitFor();assert.equal(await p.getByTestId("signage-play").count(),0);
 console.log("PASS anonymous_cannot_render_history");
 await Promise.all([own.c.close(),foreign.c.close(),anon.close()]);
}catch(error){
 let message=error instanceof Error?(error.stack??error.message):String(error);
 const secrets=[...Object.values(vars),...[...raw.matchAll(/^(?:メール|パスワード) = (.+)$/gm)].map(m=>value(m[1]))].filter(v=>typeof v==="string"&&v.length>=6);
 for(const s of secrets)message=message.split(s).join("[redacted]");console.error(message.replace(/https?:\/\/\S+/g,"[URL]"));process.exitCode=1;
}finally{await browser?.close();await Promise.all([signOutBackend(store).catch(()=>{}),signOutBackend(device).catch(()=>{})]);if(server?.exitCode===null)server.kill();}
