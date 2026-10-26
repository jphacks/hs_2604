import {it} from "vitest";
// Browser + actual SQL/RLS. Auth/PostgREST transport is a localhost fixture, not shared Supabase.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {spawn} from "node:child_process";
import {chromium} from "playwright";
import {createHeadlessBackend} from "@kago/backend";
import {createSignageDatabase,fixturePassword,id} from "../../../tests/fixtures/signage-database.mts";
import {signInDevice,loadSignageFeed,insertSignagePlays} from "./signage";
import {selectCrowdAd} from "../signage/crowd-selection.ts";
import {startPlay,endPlay} from "../signage/plays.ts";
it.skipIf(process.env.KAGO_CROWD_INSIGHT_E2E!=="1")("Insightで実SQLの選定履歴・自店限定・ログアウト・スマホ幅を確認",async()=>{
const fixture=await createSignageDatabase(),appRoot=new URL("../../../../kago-insight/",import.meta.url).pathname;
const api=createServer(async(req,res)=>{
 try{
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
  const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value)headers.set(key,Array.isArray(value)?value.join(","):value);
  const response=await fixture.fetcher("https://fixture.supabase.co"+req.url,{method:req.method,headers,body:chunks.length?Buffer.concat(chunks).toString():undefined});
  res.statusCode=response.status;response.headers.forEach((value,key)=>res.setHeader(key,value));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.statusCode=500;res.end();}
});
let server:ReturnType<typeof spawn>|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined,stage="prepare",checks=0;
await new Promise<void>(resolve=>api.listen(0,"127.0.0.1",resolve));
const addr=api.address();assert.ok(addr&&typeof addr!=="string");
const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:"+addr.port,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_fixture",NEXT_PUBLIC_INSIGHT_DATA_SOURCE:"supabase",NEXT_PUBLIC_INSIGHT_BASE_PATH:""};
try{
 for(let n=601;n<=605;n++){
  await fixture.db.query("insert into auth.users(id,email) values($1,$2)",[id(n),`browser-${n}@example.test`]);
  await fixture.db.query("insert into visits(id,user_id,store_id) values($1,$2,$3)",[id(n+100),id(n),id(1)]);
  await fixture.db.query("insert into cart_items(visit_id,product_id,quantity) values($1,$2,1)",[id(n+100),id(22)]);
 }
 const c=createHeadlessBackend({url:"https://fixture.supabase.co",publishableKey:"sb_publishable_fixture"},fixture.fetcher);
 const session=await signInDevice(c,"device-one@example.test",fixturePassword),feed=await loadSignageFeed(c,session,new Date(),true);
 const d=selectCrowdAd(feed,feed.crowd!.categoryByKey,feed.crowd!.snapshot,new Date());
 assert.equal(d.reason_code,"crowd_category");
 const play=endPlay({...startPlay(id(41),feed.items.find(i=>i.key===d.selected_key)!,"no_content",d.selected_at,id(990)),mode:"adaptive" as const,reason_code:d.reason_code,selection:d},new Date(Date.parse(d.selected_at)+4000).toISOString(),"completed");
 assert.deepEqual(await insertSignagePlays(c,session,[play]),{rejected:[]});
 stage="build";
 const build=spawn(process.execPath,["node_modules/next/dist/bin/next","build"],{cwd:appRoot,env,stdio:"ignore"});
 assert.equal(await new Promise(resolve=>build.on("exit",resolve)),0);
 // Ask the OS for a free application port; wait for this child's own ready line.
 const portProbe=createServer();await new Promise<void>(r=>portProbe.listen(0,"127.0.0.1",r));const appAddress=portProbe.address();assert.ok(appAddress&&typeof appAddress!=="string");
 const port=appAddress.port;await new Promise<void>(r=>portProbe.close(()=>r()));
 server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{cwd:appRoot,env,stdio:["ignore","pipe","ignore"]});
 let ready="";server.stdout!.on("data",c=>{ready+=String(c);});
 for(let n=0;!ready.includes("Ready in");n++){assert.equal(server.exitCode,null);assert.ok(n<100);await new Promise(r=>setTimeout(r,200));}
 const base="http://127.0.0.1:"+port;
 browser=await chromium.launch({headless:true,executablePath:"/usr/bin/google-chrome"});
 async function login(email:string){
  const context=await browser!.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();page.setDefaultTimeout(15000);
  await page.goto(base+"/login");await page.getByLabel("メールアドレス").fill(email);await page.getByLabel("パスワード").fill(fixturePassword);await page.getByRole("button",{name:"ログイン",exact:true}).click();
  for(let n=0;!(await context.cookies()).some(c=>c.name.startsWith("kago-insight-auth"));n++){assert.ok(n<100,"login cookie missing");await page.waitForTimeout(100);}
  await page.goto(base+"/signage-decisions");return {context,page};
 }
 stage="own-store";const own=await login("store@example.test");
 await own.page.getByRole("heading",{name:"サイネージの選定理由",exact:true}).waitFor();
 assert.equal(await own.page.getByTestId("signage-decision").count(),1);
 await own.page.getByText("調味料：5人",{exact:true}).waitFor();checks+=2;
 await own.page.getByText("再現用の選定記録",{exact:true}).click();await own.page.getByText(/選定版：sig06-crowd-v1/).waitFor();checks++;
 await own.page.setViewportSize({width:390,height:844});assert.ok(await own.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks++;
 stage="other-store";const other=await login("store-two@example.test");
 assert.equal(await other.page.getByTestId("signage-decision").count(),0);await other.page.getByText(/選定履歴はまだありません/).waitFor();checks++;
 stage="logout";await own.page.getByRole("button",{name:"ログアウト",exact:true}).click();await own.page.waitForURL(/\/login(?:\?|$)/);await own.page.goto(base+"/signage-decisions");await own.page.getByRole("heading",{name:"ログイン",exact:true}).waitFor();assert.equal(await own.page.getByTestId("signage-decision").count(),0);checks++;
 stage="missing-migration";await fixture.db.exec("alter table signage_decisions rename to signage_decisions_unavailable");await other.page.reload();await other.page.getByText(/選定履歴のDB設定が未適用/).waitFor();checks++;
 await own.context.close();await other.context.close();
 console.log(JSON.stringify({result:"PASS",browserChecks:checks,mode:"local_sql_rls_fixture_auth",sharedSupabase:false}));
}catch(error){console.error(JSON.stringify({result:"FAIL",stage}));throw error;}
finally{await browser?.close();server?.kill();api.closeAllConnections();await new Promise<void>(r=>api.close(()=>r()));await fixture.close();}

},120000);
