import {it} from "vitest";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {readFile,mkdir} from "node:fs/promises";
import {chromium} from "playwright";
import {createPortalDatabase,fixturePassword,id} from "../../../tests/fixtures/portal-database.mts";

it.skipIf(process.env.KAGO_MEDIA_IMAGES_E2E!=="1")("ADS-03 #226: 実画面で媒体別画像を保存し再読込する",async()=>{
 const root=new URL("../../../",import.meta.url).pathname,backend="https://fixture.supabase.co";
 const fixture=await createPortalDatabase();let server:ReturnType<typeof spawn>|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 const env={...process.env,NEXT_PUBLIC_ADS_DATA_SOURCE:"supabase",NEXT_PUBLIC_SUPABASE_URL:backend,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_fixture"};
 try{
  if(process.env.KAGO_MEDIA_SKIP_BUILD!=="1"){
   const build=spawn(process.execPath,["node_modules/next/dist/bin/next","build"],{cwd:root,env,stdio:"ignore"});
   assert.equal(await new Promise(r=>build.once("exit",r)),0);
  }
  const socket=createServer();await new Promise<void>(r=>socket.listen(0,"127.0.0.1",r));const address=socket.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>socket.close(()=>r()));
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{cwd:root,env,stdio:["ignore","pipe","ignore"]});
  let ready="";server.stdout!.on("data",c=>{ready+=String(c);});for(let i=0;!ready.includes("Ready in");i++){assert.ok(i<100);assert.equal(server.exitCode,null);await new Promise(r=>setTimeout(r,200));}
  const base="http://127.0.0.1:"+port;
  browser=await chromium.launch({headless:true,executablePath:"/usr/bin/google-chrome"});
  const context=await browser.newContext({serviceWorkers:"block",viewport:{width:1200,height:1100}});
  await context.route("**/*",async route=>{
   const request=route.request(),url=new URL(request.url());if(url.origin===base)return route.continue();
   if(url.origin!==backend)return route.abort();
   if(request.method()==="OPTIONS")return route.fulfill({status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"GET,POST,PATCH,OPTIONS"}});
   let body:BodyInit|null=request.postData();
   if(request.headers()["content-type"]?.includes("multipart/form-data")){
    body=await new Request(request.url(),{method:request.method(),headers:request.headers(),body:new Blob([new Uint8Array(request.postDataBuffer()??[])])}).formData();
   }
   const response=await fixture.fetcher(request.url(),{method:request.method(),headers:request.headers(),body});
   return route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),"access-control-allow-origin":"*"},body:Buffer.from(await response.arrayBuffer())});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);
  await page.goto(base+"/ads");await page.getByLabel("メールアドレス").fill("maker-one@example.test");await page.getByLabel("パスワード",{exact:true}).fill(fixturePassword);await page.getByRole("button",{name:"ログイン",exact:true}).click();
  await page.getByRole("heading",{name:"広告の管理",exact:true}).waitFor();
  await page.goto(base+"/ads/maker/creatives/new");
  await page.getByLabel(/^対象商品/).selectOption(id(21));await page.getByLabel(/^見出し/).fill("媒体別ブラウザ検証");
  const app=page.getByLabel(/^App用画像/),signage=page.getByLabel(/^Signage用画像/);
  await app.setInputFiles({name:"square.png",mimeType:"image/png",buffer:await readFile(root+"public/ad-assets/design-v2/CR1_v3_app.png")});
  await signage.setInputFiles({name:"wide.png",mimeType:"image/png",buffer:await readFile(root+"public/ad-assets/design-v2/CR1_v3_signage.png")});
  await page.getByRole("button",{name:"登録する",exact:true}).waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll<HTMLInputElement>('input[type="file"]')].every(i=>!i.disabled));
  assert.equal(await page.locator('img[src^="blob:"]').count(),2);
  await page.getByLabel(/^版のメモ/).fill("正方形と横長を同じ版に保存");
  await mkdir(root+"../../docs/development/screenshots",{recursive:true});
  await page.screenshot({path:root+"../../docs/development/screenshots/ads226-media-registration.png",fullPage:true});
  await page.getByRole("button",{name:"登録する",exact:true}).click();await page.waitForURL(/\/ads\/maker\/creative\?id=/);
  const created=await fixture.db.query<{id:string;image_paths:{app:string;signage:string}}>("select cv.id,cv.image_paths from creative_versions cv where cv.headline='媒体別ブラウザ検証'");
  assert.equal(created.rows.length,1);const v=created.rows[0];
  assert.ok(v.image_paths.app);assert.ok(v.image_paths.signage);assert.notEqual(v.image_paths.app,v.image_paths.signage);
  await page.reload();
  await page.locator('img[src*="'+v.image_paths.app+'"]').first().waitFor();
  await page.locator('img[src*="'+v.image_paths.signage+'"]').first().waitFor();
  await page.getByRole("button",{name:"新しい版を作る",exact:true}).click();
  await app.waitFor();await signage.waitFor();
  await app.setInputFiles({name:"square-v2.png",mimeType:"image/png",buffer:await readFile(root+"public/ad-assets/design-v2/CR1_v4_app.png")});
  await page.getByRole("button",{name:"この版を保存",exact:true}).click();
  await page.getByRole("button",{name:"新しい版を作る",exact:true}).waitFor();
  const versions=await fixture.db.query<{version:number;image_paths:{app:string;signage:string}}>("select version,image_paths from creative_versions where creative_id=(select creative_id from creative_versions where id=$1) order by version",[v.id]);
  assert.equal(versions.rows.length,2);assert.equal(versions.rows[1].version,2);
  assert.notEqual(versions.rows[1].image_paths.app,v.image_paths.app);
  assert.equal(versions.rows[1].image_paths.signage,v.image_paths.signage);
  await page.reload();await page.locator('img[src*="'+versions.rows[1].image_paths.app+'"]').first().waitFor();
  await page.setViewportSize({width:390,height:844});await page.getByRole("button",{name:"新しい版を作る",exact:true}).click();await app.waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.screenshot({path:root+"../../docs/development/screenshots/ads226-media-mobile.png",fullPage:true});
  console.log(JSON.stringify({result:"PASS",checks:12,versions:2,images:3,sharedWrites:0,mode:"real_ui_fixture_auth_actual_rls"}));
  await context.close();
 }finally{await browser?.close();server?.kill();await fixture.close();}
},120000);
