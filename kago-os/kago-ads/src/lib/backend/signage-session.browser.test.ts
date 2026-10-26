import {it} from "vitest";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {chromium} from "playwright";
import {createSignageDatabase,fixturePassword} from "../../../tests/fixtures/signage-database.mts";
it.skipIf(process.env.KAGO_SESSION_E2E!=="1")("AdsとSignageのログイン・ログアウトが互いを変更しない",async()=>{
 const root=new URL("../../../",import.meta.url).pathname,backend="https://fixture.supabase.co";
 const fixture=await createSignageDatabase();let server:ReturnType<typeof spawn>|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 const env={...process.env,NEXT_PUBLIC_ADS_DATA_SOURCE:"supabase",NEXT_PUBLIC_SUPABASE_URL:backend,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_fixture"};
 try{
  const build=spawn(process.execPath,["node_modules/next/dist/bin/next","build"],{cwd:root,env,stdio:"ignore"});
  assert.equal(await new Promise(r=>build.once("exit",r)),0);
  const s=createServer();await new Promise<void>(r=>s.listen(0,"127.0.0.1",r));const a=s.address();assert.ok(a&&typeof a!=="string");const port=a.port;await new Promise<void>(r=>s.close(()=>r()));
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{cwd:root,env,stdio:["ignore","pipe","ignore"]});
  let ready="";server.stdout!.on("data",c=>{ready+=String(c);});for(let i=0;!ready.includes("Ready in");i++){assert.ok(i<100);assert.equal(server.exitCode,null);await new Promise(r=>setTimeout(r,200));}
  const base="http://127.0.0.1:"+port;
  browser=await chromium.launch({headless:true,executablePath:"/usr/bin/google-chrome"});
  const ctx=await browser.newContext({serviceWorkers:"block"});
  await ctx.route("**/*",async route=>{
   const request=route.request(),url=new URL(request.url());if(url.origin===base)return route.continue();
   if(url.origin!==backend)return route.abort();
   if(request.method()==="OPTIONS")return route.fulfill({status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"GET,POST,PATCH,OPTIONS"}});
   const response=await fixture.fetcher(request.url(),{method:request.method(),headers:request.headers(),body:request.postData()});
   return route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),"access-control-allow-origin":"*"},body:Buffer.from(await response.arrayBuffer())});
  });
  const ads=await ctx.newPage();ads.setDefaultTimeout(15000);
  await ads.goto(base+"/ads");await ads.getByLabel("メールアドレス").fill("maker@example.test");await ads.getByLabel("パスワード",{exact:true}).fill(fixturePassword);await ads.getByRole("button",{name:"ログイン",exact:true}).click();
  await ads.getByRole("heading",{name:"広告の管理",exact:true}).waitFor();
  const before=(await ctx.cookies()).find(c=>c.name.startsWith("kago-ads-auth"));assert.ok(before);
  const signage=await ctx.newPage();signage.setDefaultTimeout(15000);await signage.goto(base+"/signage/play?debug=1");
  await signage.getByLabel("メールアドレス").fill("device-one@example.test");await signage.getByLabel("パスワード",{exact:true}).fill(fixturePassword);await signage.getByRole("button",{name:"ログインして表示を始める",exact:true}).click();
  await signage.getByTestId("signage-debug").waitFor();await signage.getByText("接続先：DB（Supabase）",{exact:true}).waitFor();
  const both=await ctx.cookies(),terminal=both.find(c=>c.name.startsWith("kago-signage-auth"));assert.ok(terminal);assert.equal(terminal.path,"/signage");
  assert.equal(both.find(c=>c.name===before.name)?.value,before.value);
  await ads.reload();await ads.getByRole("heading",{name:"広告の管理",exact:true}).waitFor();
  await ads.getByRole("button",{name:"ログアウト",exact:true}).click();await ads.getByLabel("メールアドレス").waitFor();
  assert.equal((await ctx.cookies()).find(c=>c.name===terminal.name)?.value,terminal.value);
  await signage.reload();await signage.getByTestId("signage-debug").waitFor();await signage.getByText("接続先：DB（Supabase）",{exact:true}).waitFor();
  await signage.getByRole("button",{name:"端末からログアウト",exact:true}).click();await signage.getByLabel("メールアドレス").waitFor();
  assert.equal((await ctx.cookies()).some(c=>c.name.startsWith("kago-signage-auth")),false);
  console.log(JSON.stringify({result:"PASS",checks:7,sharedWrites:0,mode:"fixture_auth_actual_rls"}));
  await ctx.close();
 }finally{await browser?.close();server?.kill();await fixture.close();}
},120000);
