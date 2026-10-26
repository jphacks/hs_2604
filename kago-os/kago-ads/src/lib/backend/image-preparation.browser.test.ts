import {it} from "vitest";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {readFile,mkdir} from "node:fs/promises";
import {chromium} from "playwright";
import {createSignageDatabase,fixturePassword,id} from "../../../tests/fixtures/signage-database.mts";

it.skipIf(process.env.KAGO_IMAGE_PREPARATION_E2E!=="1")("ADS-03: 画像確認中の保存・入力更新・キャンセル・失敗を本番画面で確認",async()=>{
 const root=new URL("../../../",import.meta.url).pathname,backend="https://fixture.supabase.co";
 const fixture=await createSignageDatabase();let server:ReturnType<typeof spawn>|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 const env={...process.env,NEXT_PUBLIC_ADS_DATA_SOURCE:"supabase",NEXT_PUBLIC_SUPABASE_URL:backend,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_fixture"};
 try{
  const build=spawn(process.execPath,["node_modules/next/dist/bin/next","build"],{cwd:root,env,stdio:"ignore"});
  assert.equal(await new Promise(r=>build.once("exit",r)),0);
  const socket=createServer();await new Promise<void>(r=>socket.listen(0,"127.0.0.1",r));const address=socket.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>socket.close(()=>r()));
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{cwd:root,env,stdio:["ignore","pipe","ignore"]});
  let ready="";server.stdout!.on("data",c=>{ready+=String(c);});for(let i=0;!ready.includes("Ready in");i++){assert.ok(i<100);assert.equal(server.exitCode,null);await new Promise(r=>setTimeout(r,200));}
  const base="http://127.0.0.1:"+port;
  browser=await chromium.launch({headless:true,executablePath:"/usr/bin/google-chrome"});
  const context=await browser.newContext({serviceWorkers:"block"});
  await context.addInitScript(()=>{
   const state={hold:true,pending:[] as (()=>void)[],created:[] as string[],revoked:[] as string[]};
   const original=HTMLImageElement.prototype.decode;
   HTMLImageElement.prototype.decode=function(){
    if(!state.hold||!this.src.startsWith("blob:"))return original.call(this);
    return new Promise<void>((resolve,reject)=>state.pending.push(()=>{original.call(this).then(resolve,reject);}));
   };
   const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
   URL.createObjectURL=(value:Blob|MediaSource)=>{const url=create(value);state.created.push(url);return url;};
   URL.revokeObjectURL=(url:string)=>{state.revoked.push(url);revoke(url);};
   Object.assign(window,{imageGate:state,releaseImages:()=>{state.hold=false;state.pending.splice(0).forEach(release=>release());},holdImages:()=>{state.hold=true;}});
  });
  const artwork=await readFile(root+"public/ad-assets/design-v2/CR1_v3_app.png");
  await context.route("**/*",async route=>{
   const request=route.request(),url=new URL(request.url());if(url.origin===base)return route.continue();
   if(url.origin!==backend)return route.abort();
   if(request.method()==="OPTIONS")return route.fulfill({status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"GET,POST,PATCH,OPTIONS"}});
   if(request.method()==="GET"&&url.pathname.startsWith("/storage/v1/object/"))return route.fulfill({status:200,contentType:"image/png",body:artwork});
   const response=await fixture.fetcher(request.url(),{method:request.method(),headers:request.headers(),body:request.postData()});
   return route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),"access-control-allow-origin":"*"},body:Buffer.from(await response.arrayBuffer())});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);
  await page.goto(base+"/ads");await page.getByLabel("メールアドレス").fill("maker@example.test");await page.getByLabel("パスワード",{exact:true}).fill(fixturePassword);await page.getByRole("button",{name:"ログイン",exact:true}).click();
  await page.getByRole("heading",{name:"広告の管理",exact:true}).waitFor();
  await page.goto(base+"/ads/maker/creative?id="+id(51));
  await page.getByRole("button",{name:"新しい版を作る",exact:true}).click();
  const save=page.getByRole("button",{name:"この版を保存",exact:true});
  await page.locator('input[type="file"]').first().waitFor();
  assert.equal(await save.isEnabled(),true);
  const picture={name:"replacement.png",mimeType:"image/png",buffer:artwork};
  await page.locator('input[type="file"]').first().setInputFiles(picture);
  await page.waitForFunction(()=>((window as unknown as {imageGate:{pending:unknown[]}}).imageGate.pending.length)>0);
  assert.equal(await save.isDisabled(),true,"decode中に旧画像を保存できてしまう");
  await page.getByText("画像を確認中です。完了するまで保存できません。",{exact:true}).waitFor();
  await page.getByLabel(/^見出し/).fill("確認中に変更した見出し");
  await page.getByLabel(/^版のメモ/).fill("確認中に変更したメモ");
  await mkdir(root+"../../docs/development/screenshots",{recursive:true});
  await page.getByRole("heading",{name:"第2版を作る",exact:true}).locator("..").locator("..").screenshot({path:root+"../../docs/development/screenshots/ads226-image-preparation.png"});
  await page.evaluate(()=>(window as unknown as {releaseImages():void}).releaseImages());
  await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('button[disabled]')?.textContent?.includes("この版を保存"));
  assert.equal(await page.getByLabel(/^見出し/).inputValue(),"確認中に変更した見出し");
  assert.equal(await page.getByLabel(/^版のメモ/).inputValue(),"確認中に変更したメモ");
  assert.equal(await save.isEnabled(),true);
  await page.evaluate(()=>(window as unknown as {holdImages():void}).holdImages());
  await page.locator('input[type="file"]').first().setInputFiles(picture);await page.waitForFunction(()=>((window as unknown as {imageGate:{pending:unknown[]}}).imageGate.pending.length)>0);
  await page.getByRole("button",{name:"やめる",exact:true}).click();
  await page.evaluate(()=>(window as unknown as {releaseImages():void}).releaseImages());
  await page.getByRole("button",{name:"新しい版を作る",exact:true}).waitFor();
  assert.equal(await page.locator('input[type="file"]').count(),0);
  assert.equal(await page.evaluate(()=>{const s=(window as unknown as {imageGate:{created:string[],revoked:string[]}}).imageGate;return s.created.every(url=>s.revoked.includes(url));}),true);
  await page.getByRole("button",{name:"新しい版を作る",exact:true}).click();
  await page.locator('input[type="file"]').first().setInputFiles({name:"broken.png",mimeType:"image/png",buffer:Buffer.from("not a PNG")});
  await page.getByText(/正常な画像を5MiB以下/).waitFor();assert.equal(await save.isDisabled(),true);
  await page.getByRole("button",{name:"選択前の画像を使う",exact:true}).click();assert.equal(await save.isEnabled(),true);
  await page.locator('input[type="file"]').first().setInputFiles({name:"broken.png",mimeType:"image/png",buffer:Buffer.from("not a PNG")});
  await page.getByText(/正常な画像を5MiB以下/).waitFor();assert.equal(await save.isDisabled(),true);
  await page.locator('input[type="file"]').first().setInputFiles(picture);await page.waitForFunction(()=>!document.querySelector<HTMLInputElement>('input[type="file"]')?.disabled);assert.equal(await save.isEnabled(),true);
  await page.getByRole("button",{name:"やめる",exact:true}).click();
  await page.goto(base+"/ads/maker/creatives/new");await page.getByRole("heading",{name:"新しい広告素材を登録",exact:true}).waitFor();
  await page.getByLabel(/^対象商品/).selectOption(id(21));
  await page.getByLabel(/^見出し/).fill("最初の入力");
  await page.locator('input[type="file"]').first().setInputFiles(picture);await page.waitForFunction(()=>((window as unknown as {imageGate:{pending:unknown[]}}).imageGate.pending.length)>0);
  assert.equal(await page.getByRole("button",{name:"登録する",exact:true}).isDisabled(),true);
  await page.getByLabel(/^対象商品/).selectOption(id(22));await page.getByLabel(/^見出し/).fill("最新の入力");await page.getByLabel(/^版のメモ/).fill("最新のメモ");
  await page.evaluate(()=>(window as unknown as {releaseImages():void}).releaseImages());await page.waitForFunction(()=>!document.querySelector<HTMLInputElement>('input[type="file"]')?.disabled);
  assert.equal(await page.getByLabel(/^対象商品/).inputValue(),id(22));assert.equal(await page.getByLabel(/^見出し/).inputValue(),"最新の入力");assert.equal(await page.getByLabel(/^版のメモ/).inputValue(),"最新のメモ");
  assert.equal(await page.getByRole("button",{name:"登録する",exact:true}).isEnabled(),true);
  await page.reload();await page.getByRole("heading",{name:"新しい広告素材を登録",exact:true}).waitFor();
  await page.locator('input[type="file"]').first().setInputFiles(picture);await page.waitForFunction(()=>((window as unknown as {imageGate:{pending:unknown[]}}).imageGate.pending.length)>0);
  await page.getByRole("link",{name:"広告素材",exact:true}).click();await page.waitForURL(base+"/ads/maker/creatives");
  await page.evaluate(()=>(window as unknown as {releaseImages():void}).releaseImages());await page.goBack();
  await page.getByRole("heading",{name:"新しい広告素材を登録",exact:true}).waitFor();
  assert.equal(await page.locator('input[type="file"]').first().isEnabled(),true);
  assert.equal(await page.getByRole("button",{name:"登録する",exact:true}).isEnabled(),true);
  await page.locator('input[type="file"]').first().setInputFiles({name:"broken.png",mimeType:"image/png",buffer:Buffer.from("not a PNG")});
  await page.getByText(/正常な画像を5MiB以下/).waitFor();
  await page.getByRole("link",{name:"広告素材",exact:true}).click();await page.waitForURL(base+"/ads/maker/creatives");await page.goBack();
  await page.getByRole("heading",{name:"新しい広告素材を登録",exact:true}).waitFor();
  if(await page.getByText(/正常な画像を5MiB以下/).isVisible()){
   assert.equal(await page.getByRole("button",{name:"登録する",exact:true}).isDisabled(),true);
  }else{
   // Nextの通常の画面破棄ではフォーム自体が初期化される。どちらでも古い画像を保存しない。
   assert.equal(await page.locator('img[src^="blob:"]').count(),0);
   assert.equal(await page.getByLabel(/^対象商品/).inputValue(),"");
  }
  assert.equal(fixture.requests.some(path=>/^POST \/rest\/v1\/(creative|ad_)/.test(path)||path.startsWith("PATCH /rest/v1/")),false);
  assert.equal((await fixture.db.query<{n:number}>("select count(*)::int n from creative_versions")).rows[0].n,4);
  console.log(JSON.stringify({result:"PASS",checks:20,sharedWrites:0,mode:"fixture_auth_actual_rls",screenshot:"fake_maker_form_food_only"}));
  await context.close();
 }finally{await browser?.close();server?.kill();await fixture.close();}
},120000);
