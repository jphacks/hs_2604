import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {mkdir} from "node:fs/promises";
import {chromium} from "playwright";
const root=new URL("../",import.meta.url).pathname,base="http://127.0.0.1:3206";
const env={...process.env,NEXT_PUBLIC_ADS_DATA_SOURCE:"mock"};
const checks:string[]=[];
async function run(args:string[]){
 await new Promise<void>((resolve,reject)=>{
  const p=spawn(process.execPath,["node_modules/next/dist/bin/next",...args],{cwd:root,env,stdio:"inherit"});
  p.once("error",reject);p.once("exit",code=>code===0?resolve():reject(new Error("Next.js exited "+code)));
 });
}
if(process.env.KAGO_E2E_SKIP_BUILD!=="1")await run(["build","--webpack"]);
let server:ChildProcess|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try{
 server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3206"],{cwd:root,env,stdio:["ignore","pipe","pipe"]});
 let output="";server.stdout?.on("data",c=>output=(output+c).slice(-2000));server.stderr?.on("data",c=>output=(output+c).slice(-2000));
 for(let i=0;i<100;i++){
  if(server.exitCode!==null)throw new Error("Server startup failed: "+output);
  try{if((await fetch(base+"/signage/selection-demo")).ok)break;}catch{/* starting */}
  if(i===99)throw new Error("Server startup timed out");
  await new Promise(r=>setTimeout(r,200));
 }
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH??"/usr/bin/google-chrome",headless:true});
 const ctx=await browser.newContext({viewport:{width:1280,height:1100}}),errors:string[]=[],external:string[]=[];
 await ctx.route("**/*",route=>{
  if(new URL(route.request().url()).origin===base)return route.continue();
  external.push(route.request().url());return route.abort();
 });
 const page=await ctx.newPage();page.on("pageerror",e=>errors.push(e.message));
 await page.goto(base+"/signage/selection-demo",{waitUntil:"networkidle"});
 const selected=page.getByTestId("crowd-selected"),reason=page.getByTestId("crowd-reason");
 assert.equal(await selected.textContent(),"パスタの広告");
 assert.match(await reason.textContent()??"",/パスタ/);checks.push("初期のパスタ集計と選定理由");
 const images=new URL("../../../docs/images/",import.meta.url);await mkdir(images,{recursive:true});
 await page.screenshot({path:new URL("sig06-crowd-pasta.png",images).pathname,fullPage:true,animations:"disabled"});
 async function choose(label:string,expected:string,explanation:RegExp){
  await page.getByRole("button",{name:label,exact:true}).click();
  await selected.filter({hasText:expected}).waitFor();
  assert.equal(await selected.textContent(),expected);assert.match(await reason.textContent()??"",explanation);
 }
 await choose("パン多め","パンの広告",/パン/);checks.push("パン集計で広告と理由が切り替わる");
 await choose("少人数","汎用のご案内",/人数が少ない/);
 assert.equal(await page.getByTestId("crowd-snapshot").count(),0);checks.push("少人数は内訳を表示しない");
 await choose("集計なし","汎用のご案内",/集計がない/);
 await choose("期限切れ","汎用のご案内",/有効期限/);checks.push("欠落と期限切れは汎用案内");
 await choose("パスタ広告を停止","パンの広告",/パン/);
 await choose("全広告を停止","汎用のご案内",/表示できる広告がない/);checks.push("停止した広告は選ばない");
 await page.getByRole("button",{name:"最新の選定を再現",exact:true}).click();
 await page.getByRole("status").filter({hasText:"同じ選定を再現しました"}).waitFor();checks.push("記録した条件から同じ選定を再現");
 const downloaded=page.waitForEvent("download");await page.getByRole("button",{name:"ログJSONをダウンロード",exact:true}).click();
 const download=await downloaded,stream=await download.createReadStream();assert.ok(stream);
 let text="";for await(const c of stream)text+=c.toString();
 const log=JSON.parse(text);assert.equal(log.format,"sig06-demo-v1");assert.equal(log.entries.length,7);
 const small=log.entries.find((e:{scenario:string})=>e.scenario==="small");
 assert.equal(small.decision.snapshot,null);assert.deepEqual(small.decision.weights,[]);
 for(const e of log.entries){assert.equal(e.decision.policy_version,"sig06-crowd-v1");assert.equal(e.decision.store_id,"SIG06-S1");}
 assert.equal(log.entries.find((e:{scenario:string})=>e.scenario==="bread").decision.weights[0].weight,.75);
 assert.equal(log.entries.find((e:{scenario:string})=>e.scenario==="stopped").decision.weights.some((w:{key:string})=>w.key==="PASTA"),false);
 checks.push("JSONに選定版・重み・理由を保持し、少人数の集計は残さない");
 await page.setViewportSize({width:390,height:844});await choose("パン多め","パンの広告",/パン/);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await page.screenshot({path:new URL("sig06-crowd-mobile.png",images).pathname,fullPage:true,animations:"disabled"});checks.push("390px幅で横にはみ出さない");
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);checks.push("画面エラー・共有DBへの通信なし");
 for(const check of checks)console.log("PASS "+check);console.log(checks.length+" browser checks passed");
 await ctx.close();
}finally{
 await browser?.close();
 if(server&&server.exitCode===null){
  await new Promise<void>(resolve=>{server!.once("exit",()=>resolve());server!.kill();setTimeout(()=>{server!.kill("SIGKILL");resolve();},3000).unref();});
 }
}
