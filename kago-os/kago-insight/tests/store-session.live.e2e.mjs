import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import {chromium} from "playwright";
import {createHeadlessBackend,signInBackend,signOutBackend} from "@kago/backend";
assert.equal(process.env.KAGO_STORE_SESSION_LIVE,"1","Explicit live-read opt-in required");
assert.ok(process.env.KAGO_CONNECTION_FILE);
const raw=await readFile(process.env.KAGO_CONNECTION_FILE,"utf8"),val=s=>{try{return JSON.parse(s.trim());}catch{return s.trim();}};
const vars=Object.fromEntries([...raw.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)].map(m=>[m[1],val(m[2])]));
function account(alias){let active=false,email="",password="";for(const line of raw.split(/\r?\n/)){
 if(line.startsWith("[")){active=new RegExp("^\\["+alias+"(?:/[^\\]]+)?\\]$").test(line);continue;}
 if(active&&line.startsWith("メール = "))email=val(line.slice("メール = ".length));if(active&&line.startsWith("パスワード = "))password=val(line.slice("パスワード = ".length));
}assert.ok(email&&password);return {email,password};}
const config={url:vars.NEXT_PUBLIC_SUPABASE_URL,publishableKey:vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY};
const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:config.publishableKey,NEXT_PUBLIC_INSIGHT_DATA_SOURCE:"supabase",NEXT_PUBLIC_INSIGHT_BASE_PATH:""};
delete env.KAGO_DEMO_STORE_EMAIL;delete env.KAGO_DEMO_STORE_PASSWORD;
const root=fileURLToPath(new URL("../",import.meta.url)),base="http://127.0.0.1:3297",paths=["/review","/promotions","/metrics"];
let browser,server;const clients=[],report={status:"running",checks:[]};
async function pass(label){report.checks.push(label);console.log("PASS "+label);}
async function poll(fn){for(let i=0;i<150;i++){if(await fn())return;await new Promise(r=>setTimeout(r,300));}throw Error("Condition timed out");}
async function myStore(alias){
 const c=createHeadlessBackend(config);clients.push(c);const a=account(alias);await signInBackend(c,a.email,a.password,"store_staff");
 const member=await c.from("store_members").select("store_id");assert.ifError(member.error);assert.equal(member.data.length,1);
 const row=await c.from("stores").select("id,name,branch_name").eq("id",member.data[0].store_id).single();assert.ifError(row.error);return row.data;
}
try{
 const stores={T1:await myStore("T1"),T2:await myStore("T2")};assert.notEqual(stores.T1.id,stores.T2.id);
 if(process.env.KAGO_E2E_SKIP_BUILD!=="1")await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[root+"node_modules/next/dist/bin/next","build"],{cwd:root,env,stdio:"ignore"});p.on("error",reject);p.on("exit",n=>n===0?resolve():reject(Error("Build failed")));});
 server=spawn(process.execPath,[root+"node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3297"],{cwd:root,env,stdio:"ignore"});
 await poll(async()=>{if(server.exitCode!==null)throw Error("Server exited");try{return(await fetch(base+"/login")).ok;}catch{return false;}});
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH??"/usr/bin/google-chrome",headless:true});
 const ctx=await browser.newContext({permissions:[]}),page=await ctx.newPage();
 async function denied(p){await poll(async()=>new URL(p.url()).pathname==="/login");assert.equal(await p.getByRole("button",{name:"ログアウト",exact:true}).count(),0);await p.locator('input[name="email"]').waitFor();}
 async function login(alias,path="/review"){
  await page.goto(base+path);await page.locator('input[name="email"]').fill(account(alias).email);await page.locator('input[name="password"]').fill(account(alias).password);
  await page.getByRole("button",{name:"ログイン",exact:true}).click();
 }
 async function shows(alias){
  const header=page.getByRole("banner");await header.waitFor();
  const label=s=>s.name+(s.branch_name?" "+s.branch_name:""),expected=label(stores[alias]),foreign=label(stores[alias==="T1"?"T2":"T1"]);
  await header.getByText(expected,{exact:true}).waitFor();if(foreign!==expected)assert.equal(await header.getByText(foreign,{exact:true}).count(),0);
  await page.getByRole("button",{name:"ログアウト",exact:true}).waitFor();
 }
 for(const path of paths){await page.goto(base+path);await denied(page);}await pass("anonymous_three_screens_redirect_without_store_data");
 await login("T1");await shows("T1");await page.reload();await shows("T1");await pass("real_t1_header_and_reload_persist");
 for(const path of paths){await page.goto(base+path);await shows("T1");}await pass("t1_scope_on_review_promotions_metrics");
 await page.getByRole("button",{name:"ログアウト",exact:true}).click();await denied(page);
 for(const path of paths){await page.goto(base+path);await denied(page);}await pass("logout_all_three_screens_denied");
 await login("T2","/metrics");await shows("T2");
 for(const path of paths){await page.goto(base+path);await shows("T2");}await pass("same_browser_switch_t2_never_retains_t1_header");
 await page.reload();await shows("T2");await pass("real_t2_reload_persist");
 const cookies=await ctx.cookies(),authCookies=cookies.filter(c=>/auth/i.test(c.name));assert.ok(authCookies.length);
 await ctx.addCookies(authCookies.map(c=>({...c,value:"invalid-session"})));
 for(const path of paths){await page.goto(base+path);await denied(page);}await pass("invalid_auth_cookie_all_three_screens_denied");
 await ctx.clearCookies();await login("M1");await page.getByRole("alert").waitFor();await denied(page);await pass("maker_role_cannot_enter_store_insight");
 await ctx.close();report.status="PASS";
}catch(error){
 report.status="FAIL";let message=error instanceof Error?(error.stack??error.message):String(error);
 const secrets=[...Object.values(vars),...[...raw.matchAll(/^(?:メール|パスワード) = (.+)$/gm)].map(m=>val(m[1]))].filter(s=>typeof s==="string"&&s.length>=6);for(const s of secrets)message=message.split(s).join("[redacted]");console.error(message.replace(/https?:\/\/\S+/g,"[URL]"));process.exitCode=1;
}finally{await writeFile(process.env.KAGO_SESSION_REPORT??"/tmp/kago82-live.json",JSON.stringify(report,null,2),{mode:0o600});await browser?.close();await Promise.all(clients.map(c=>signOutBackend(c).catch(()=>{})));if(server?.exitCode===null)server.kill();}
