import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { chromium } from "playwright";
import { createPortalDatabase, fixturePassword } from "../../kago-ads/tests/fixtures/portal-database.mts";

const appRoot = new URL("../", import.meta.url).pathname;
const adsRoot = new URL("../../kago-ads/", import.meta.url).pathname;
async function freePort(){const server=createServer();await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const address=server.address();assert.ok(address&&typeof address!=="string");await new Promise<void>(r=>server.close(()=>r()));return address.port;}
const appPort=await freePort(),adsPort=await freePort();
const base="http://127.0.0.1:"+appPort,adsOrigin="http://127.0.0.1:"+adsPort;
const backendUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://ads-fixture.invalid";
const env = { ...process.env, ADS_ORIGIN: adsOrigin, NEXT_PUBLIC_ADS_DATA_SOURCE: "supabase",
  NEXT_PUBLIC_SUPABASE_URL: backendUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_fixture" };

async function build(cwd: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("pnpm", args, { cwd, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Build failed: ${code}`)));
  });
}
if (process.env.KAGO_E2E_SKIP_BUILD !== "1") {
  await build(adsRoot, ["build"]);
  await build(appRoot, ["build"]);
}

const servers: ChildProcess[] = [];
async function start(cwd: string, port: number, path: string) {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  servers.push(child);
  let output = "";
  child.stdout?.on("data", chunk => { output = (output + chunk).slice(-2000); });
  child.stderr?.on("data", chunk => { output = (output + chunk).slice(-2000); });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Server stopped: ${output}`);
    try { if (output.includes("Ready in")&&(await fetch(`http://127.0.0.1:${port}${path}`)).ok) return; } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("Server startup timed out");
}

const fixture=await createPortalDatabase();
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
let checks=0;
try{
 await start(adsRoot,adsPort,"/ads");await start(appRoot,appPort,"/ads");
 for(const origin of [base,adsOrigin]){
  const query="?entry_check=%E5%BA%83%E5%B3%B6&tag=a%2Fb&tag=c";
  for(const prefix of ["Ads","ADS","aDs"]){
   for(const tail of ["","/portal","/maker/results"]){
    const response=await fetch(origin+"/"+prefix+tail+query,{redirect:"manual"});
    assert.equal(response.status,307);
    const location=new URL(response.headers.get("location")!,origin);
    assert.equal(location.origin,origin);assert.equal(location.pathname,"/ads"+tail);assert.equal(location.search,query);
    const canonical=await fetch(location,{redirect:"manual"});assert.equal(canonical.status,200);checks++;
   }
  }
  let next=origin+"/Ads/"+query;
  for(let n=0;n<4;n++){
   const response=await fetch(next,{redirect:"manual"});
   if(response.status===200){assert.equal(new URL(next).pathname,"/ads");assert.equal(new URL(next).search,query);checks++;break;}
   assert.ok([307,308].includes(response.status));next=new URL(response.headers.get("location")!,next).href;assert.ok(n<3,"redirect loop");
  }
 }
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH??"/usr/bin/google-chrome",headless:true});
 for(const origin of [base,adsOrigin])for(const role of ["maker","store"]){
  const context=await browser.newContext();
  await context.route("**/*",async route=>{
   const request=route.request(),url=new URL(request.url());
   if([base,adsOrigin].includes(url.origin))return route.continue();
   if(url.origin!==new URL(backendUrl).origin)return route.abort();
   if(request.method()==="OPTIONS")return route.fulfill({status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"GET,POST,PATCH,OPTIONS"}});
   const response=await fixture.fetcher(request.url(),{method:request.method(),headers:request.headers(),body:request.postData()});
   return route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),"access-control-allow-origin":"*"},body:Buffer.from(await response.arrayBuffer())});
  });
  const sentinels=[{name:"kago-insight-auth",value:"independent-insight",url:origin},{name:"sb-independent-auth-token",value:"independent-app",url:origin}];
  await context.addCookies(sentinels);
  const p=await context.newPage();p.setDefaultTimeout(15000);const errors:string[]=[];p.on("pageerror",e=>errors.push(e.message));
  await p.goto(origin+"/Ads?case_check=1");await p.getByLabel("メールアドレス").waitFor();
  assert.equal(new URL(p.url()).pathname,"/ads");assert.equal(new URL(p.url()).search,"?case_check=1");checks++;
  if(role==="store")await p.getByRole("radio",{name:"店舗担当者",exact:true}).check();
  await p.getByLabel("メールアドレス").fill(role==="maker"?"maker-one@example.test":"store@example.test");
  await p.getByLabel("パスワード",{exact:true}).fill(fixturePassword);await p.getByRole("button",{name:"ログイン",exact:true}).click();
  const home=role==="maker"?"広告の管理":"広告募集の管理";
  await p.getByRole("heading",{name:home,exact:true}).waitFor();checks++;
  await p.goto(origin+"/aDS?case_check=2");await p.getByRole("heading",{name:home,exact:true}).waitFor();
  assert.equal(new URL(p.url()).pathname,"/ads");assert.equal(await p.getByText("この操作はDB接続の準備中です",{exact:true}).count(),0);checks++;
  await p.reload();await p.getByRole("heading",{name:home,exact:true}).waitFor();checks++;
  await p.goto(origin+"/Ads/portal?existing=1");
  assert.equal(new URL(p.url()).pathname,"/ads/portal");
  if(role==="maker")await p.getByRole("heading",{name:"募集を探す",exact:true}).waitFor();
  else await p.getByText("募集ポータルはメーカー向けです。自店の募集は「自店の募集」で確認できます。",{exact:true}).waitFor();
  assert.equal(await p.getByText("この操作はDB接続の準備中です",{exact:true}).count(),0);checks++;
  await p.getByRole("button",{name:"ログアウト",exact:true}).click();await p.getByLabel("メールアドレス").waitFor();
  const cookies=await context.cookies();for(const cookie of sentinels)assert.equal(cookies.find(c=>c.name===cookie.name)?.value,cookie.value);
  assert.deepEqual(errors,[]);checks++;await context.close();
 }
 console.log(JSON.stringify({result:"PASS",checks,origins:2,roles:2,mode:"fixture_auth_actual_sql",sharedWrites:0}));
}finally{await browser?.close();for(const server of servers)server.kill("SIGTERM");await fixture.close();}
