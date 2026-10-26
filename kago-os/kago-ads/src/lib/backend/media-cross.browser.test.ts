import {it} from "vitest";
import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {createServer} from "node:net";
import {readFile,mkdir,writeFile,rm,access} from "node:fs/promises";
import {chromium} from "playwright";
import {createHeadlessBackend,signInBackend} from "@kago/backend";
import {createMediaHttp} from "../../../tests/fixtures/media-http.mts";
import {fixturePassword,id,users} from "../../../tests/fixtures/portal-database.mts";
import {createSupabaseMakerRepository} from "./maker";
import {loadSignageFeed} from "./signage";

it.skipIf(process.env.KAGO_MEDIA_CROSS_E2E!=="1")("ADS-03 #226: App・Insight・Signageで同じ版の媒体別画像を確認",async()=>{
 const repo=new URL("../../../../../",import.meta.url).pathname;
 const http=await createMediaHttp(),servers:ChildProcess[]=[];
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 const testDir=repo+"kago-os/kago-app/src/app/ui-preview/media-fixture";
 const env={...process.env,NEXT_PUBLIC_ADS_DATA_SOURCE:"supabase",NEXT_PUBLIC_INSIGHT_DATA_SOURCE:"supabase",NEXT_PUBLIC_SUPABASE_URL:http.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_fixture"};
 let owns=false;
 async function start(app:string){
  const cwd=repo+"kago-os/"+app;
  const build=spawn(process.execPath,["node_modules/next/dist/bin/next","build"],{cwd,env,stdio:["ignore","pipe","pipe"]});
  let output="";build.stdout!.on("data",c=>output+=String(c));build.stderr!.on("data",c=>output+=String(c));
  assert.equal(await new Promise(r=>build.once("exit",r)),0,output.slice(-5000));
  const socket=createServer();await new Promise<void>(r=>socket.listen(0,"127.0.0.1",r));const address=socket.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>socket.close(()=>r()));
  const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{cwd,env,stdio:["ignore","pipe","pipe"]});servers.push(server);
  let ready="";server.stdout!.on("data",c=>ready+=String(c));server.stderr!.on("data",c=>ready+=String(c));
  for(let i=0;!ready.includes("Ready in");i++){assert.ok(i<100,ready);assert.equal(server.exitCode,null,ready);await new Promise(r=>setTimeout(r,200));}
  return "http://127.0.0.1:"+port;
 }
 try{
  const c=createHeadlessBackend({url:http.url,publishableKey:"sb_publishable_fixture"});
  await signInBackend(c,"maker-one@example.test",fixturePassword,"maker_staff");
  const app=new Blob([await readFile(repo+"kago-os/kago-ads/public/ad-assets/design-v2/CR1_v3_app.png")],{type:"image/png"});
  const signage=new Blob([await readFile(repo+"kago-os/kago-ads/public/ad-assets/design-v2/CR1_v3_signage.png")],{type:"image/png"});
  const maker=createSupabaseMakerRepository(c),session={role:"maker_staff",makerId:id(11)} as const;
  const creative=await maker.createCreative(session,{product_id:id(21),headline:"媒体別共通検証",note:"",assets:{
   app:{kind:"image",path:"blob:app",upload:app,bytes:app.size,width:1254,height:1254,file_name:"square.png"},
   signage:{kind:"image",path:"blob:signage",upload:signage,bytes:signage.size,width:1672,height:941,file_name:"wide.png"}}},id(400));
  const v=creative.versions[0];
  const application=await maker.submitApplication(session,id(31),{creative_version_id:v.id,channels:["app","signage"],requested_start:"2099-01-01T00:00:00+09:00",requested_end:"2099-02-01T00:00:00+09:00",message:"媒体別の確認"});
  await assert.rejects(access(testDir));await mkdir(testDir,{recursive:true});owns=true;
  await writeFile(testDir+"/page.tsx",await readFile(repo+"kago-os/kago-ads/tests/fixtures/media-app-preview.tsx.txt","utf8"));
  const appUrl=await start("kago-app"),insightUrl=await start("kago-insight");
  browser=await chromium.launch({headless:true,executablePath:"/usr/bin/google-chrome"});
  const storeContext=await browser.newContext({viewport:{width:1200,height:1100}});
  const review=await storeContext.newPage();review.setDefaultTimeout(15000);
  await review.goto(insightUrl+"/login");await review.getByLabel("メールアドレス").fill("store@example.test");await review.getByLabel("パスワード",{exact:true}).fill(fixturePassword);await review.getByRole("button",{name:"ログイン",exact:true}).click();
  await review.waitForURL(url=>url.pathname!=="/login");
  await review.goto(insightUrl+"/review");await review.getByRole("button",{name:/媒体別共通検証/}).click();
  await review.locator('img[src*="'+v.assets.app!.storage_path+'"]').waitFor();
  await review.locator('img[src*="'+v.assets.signage!.storage_path+'"]').waitFor();
  await review.getByText("App用画像（1:1）",{exact:true}).waitFor();await review.getByText("Signage用画像（16:9）",{exact:true}).waitFor();
  const screenshot=repo+"docs/development/screenshots";await mkdir(screenshot,{recursive:true});
  await review.screenshot({path:screenshot+"/ads226-insight-review.png",fullPage:true});
  await http.fixture.asUser(users.find(u=>u.n===104)!,()=>http.fixture.db.query("select * from kago_approve_application($1,1,null,null,array['app','signage'])",[application.id]),true);
  const customer=await browser.newContext({viewport:{width:390,height:844}}),page=await customer.newPage();page.setDefaultTimeout(15000);
  await page.goto(appUrl+"/ui-preview/media-fixture?version="+v.id);
  const image=page.locator('img[src*="'+v.assets.app!.storage_path+'"]');await image.waitFor();
  await page.waitForFunction(()=>{const i=document.querySelector("img");return !!i&&i.complete&&i.naturalWidth>0;});
  assert.deepEqual(await image.evaluate(i=>[(i as HTMLImageElement).naturalWidth,(i as HTMLImageElement).naturalHeight]),[1254,1254]);
  assert.equal(await page.locator('img[src*="'+v.assets.signage!.storage_path+'"]').count(),0);
  await page.screenshot({path:screenshot+"/ads226-app-image.png",fullPage:true});
  await page.getByRole("button",{name:"ログアウト",exact:true}).click();await image.waitFor({state:"detached"});
  const device=createHeadlessBackend({url:http.url,publishableKey:"sb_publishable_fixture"});
  await signInBackend(device,"device-one@example.test",fixturePassword,"signage");
  const feed=await loadSignageFeed(device,{role:"signage",deviceId:id(41),storeId:id(1)},new Date("2099-01-10T00:00:00+09:00"));
  const item=feed.items.find(item=>item.creative_version_id===v.id);assert.ok(item);
  assert.equal(item.asset.path,v.assets.signage!.storage_path);
  console.log(JSON.stringify({result:"PASS",checks:10,app:"actual_component",insight:"actual_review_screen",signage:"actual_feed",sharedWrites:0}));
  await storeContext.close();await customer.close();
 }finally{
  await browser?.close();servers.forEach(server=>server.kill());
  if(owns)await rm(testDir,{recursive:true});
  await http.close();
 }
},180000);
