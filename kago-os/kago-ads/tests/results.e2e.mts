import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir} from "node:fs/promises";
import {chromium,type Page} from "playwright";
import {createResultsDatabase,metricId} from "./fixtures/results-database.mts";
import {fixturePassword} from "./fixtures/portal-database.mts";
const mock=process.env.KAGO_RESULTS_MOCK==="1";
const root=new URL("../",import.meta.url).pathname,base="http://127.0.0.1:3197";
const env={...process.env,NEXT_PUBLIC_ADS_DATA_SOURCE:mock?"mock":"supabase",NEXT_PUBLIC_SUPABASE_URL:"https://results-fixture.invalid",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_fixture"};
if(process.env.KAGO_E2E_SKIP_BUILD!=="1"){
 await new Promise<void>((resolve,reject)=>{
  const p=spawn(process.execPath,["node_modules/next/dist/bin/next","build","--webpack"],{cwd:root,env,stdio:"inherit"});
  p.once("exit",c=>c===0?resolve():reject(new Error("Build failed")));p.once("error",reject);
 });
}
const fixture=mock?null:await createResultsDatabase();
let server:ReturnType<typeof spawn>|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
const checks:string[]=[],errors:string[]=[];
const shown=async(p:Page,text:string)=>p.getByText(text,{exact:true}).first().waitFor();
async function login(p:Page,email="maker-one@example.test",role:"maker_staff"|"store_staff"="maker_staff"){
 await p.getByLabel(role==="maker_staff"?"メーカー":"店舗担当者",{exact:true}).check();
 await p.getByLabel("メールアドレス").fill(email);await p.getByLabel("パスワード",{exact:true}).fill(fixturePassword);
 await p.getByRole("button",{name:"ログイン",exact:true}).click();
}
try {
 server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3197"],{cwd:root,env,stdio:"ignore"});
 for(let i=0;i<100;i++){try{if((await fetch(base+"/ads")).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({executablePath:"/usr/bin/google-chrome",headless:true});
 let outage=false,delayNext=false;
 async function context(){
  const ctx=await browser!.newContext({viewport:{width:1280,height:900}});
  ctx.on("page",p=>p.on("pageerror",e=>errors.push(e.message)));
  if(fixture)await ctx.route("https://results-fixture.invalid/**",async route=>{
   const req=route.request();
   if(req.method()==="OPTIONS"){await route.fulfill({status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"GET,POST,OPTIONS"}});return;}
   if(req.url().includes("/rpc/")){
    if(outage){await route.fulfill({status:503,contentType:"application/json",body:'{"message":"unavailable"}',headers:{"access-control-allow-origin":"*"}});return;}
    if(delayNext){delayNext=false;await new Promise(r=>setTimeout(r,500));}
   }
   const response=await fixture.fetcher(req.url(),{method:req.method(),headers:req.headers(),body:req.postData()});
   await route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),"access-control-allow-origin":"*","access-control-expose-headers":"x-supabase-api-version"},body:Buffer.from(await response.arrayBuffer())});
  });
  return ctx;
 }
 const ctx=await context(),page=await ctx.newPage();
 const images=new URL("../../../docs/images/",import.meta.url);await mkdir(images,{recursive:true});
 if(mock){
  await page.goto(base+"/ads/maker/results?as=maker_staff:M1");
  await page.getByRole("heading",{name:"広告の成果",exact:true}).waitFor();
  await page.getByTestId("app-operated").waitFor();
  assert.match(await page.getByTestId("app-operated").innerText(),/298円/);
  assert.match(await page.getByTestId("signage-operated").innerText(),/未計測/);
  checks.push("仮データ版の実表示・購入・未計測の表示を維持");
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  checks.push("仮データ版のスマホ表示");
  await page.goto(base+"/ads/maker/results?as=maker_staff:M2");
  await shown(page,"承認された広告はまだありません。店舗の募集に申請し、承認されると、ここに成果が出ます。");
  checks.push("仮データ版の他社成果を非表示");
 }else{
  await page.addInitScript(()=>localStorage.setItem("kago-ads-session-v1",JSON.stringify({role:"maker_staff",makerId:"M1"})));
  await page.goto(base+"/ads/maker/results?as=maker_staff:M1");
  await shown(page,"メーカーとしてログイン");
  checks.push("成果の直接URLと仮セッションで実認証を迂回できない");
  await login(page);
  await page.getByRole("heading",{name:"広告の成果",exact:true}).waitFor();
  const card=page.getByTestId("result-"+metricId("c",1)).locator("..");
  await card.getByTestId("app-operated").waitFor();
  const app=card.getByTestId("app-operated").locator("td");
  assert.equal((await app.nth(1).innerText()).trim(),"1");
  assert.match(await app.nth(3).innerText(),/100%/);
  assert.equal((await app.nth(8).innerText()).trim(),"200円");
  assert.equal(await page.getByTestId("result-"+metricId("c",2)).count(),0);
  checks.push("実接続モードから成果を表示し、自社の実表示・率・購入金額だけを取得");
  await card.getByTestId("app-seeded").waitFor();
  await card.getByTestId("app-operated").getByText("少数のため参考値",{exact:true}).waitFor();
  checks.push("実測・事前投入・少数の注記を区別");
  const signage=card.getByTestId("signage-operated").locator("td");
  assert.equal((await signage.nth(1).innerText()).trim(),"4");
  assert.equal((await signage.nth(6).innerText()).trim(),"3");
  assert.equal((await signage.nth(4).innerText()).trim(),"0人");
  await card.getByTestId("signage-seeded").getByText("未計測",{exact:true}).first().waitFor();
  checks.push("2端末の再生を集計し販売数を重複させず、計測した0人と未計測を区別");
  await page.getByRole("link",{name:"広告の成果",exact:true}).waitFor();
  await page.screenshot({path:new URL("ads04-results-db.png",images).pathname,fullPage:true});
  await page.getByLabel("店舗").selectOption(metricId("2",1));
  await card.waitFor();checks.push("店舗の絞込み");
  delayNext=true;
  await page.getByLabel("期間（はじめ）",{exact:true}).fill("2026-10-23");
  await page.getByTestId("app-operated").waitFor({state:"hidden"});
  await card.getByTestId("app-operated").waitFor();
  assert.equal((await card.getByTestId("app-operated").locator("td").nth(1).innerText()).trim(),"0");
  assert.equal(await card.getByTestId("app-operated").getByText("少数のため参考値",{exact:true}).count(),0);
  checks.push("期間変更中に旧集計を見せず、記録0件を0と表示");
  await page.getByLabel("期間（はじめ）",{exact:true}).fill("2026-10-22");
  await card.getByTestId("app-operated").waitFor();
  await fixture!.db.query("update ad_calls set disclosure_scope=$1 where id=$2",[["impressions","clicks"],metricId("8",1)]);
  await page.reload();await card.getByTestId("app-operated").waitFor();
  assert.equal((await card.getByTestId("app-operated").locator("td").nth(8).innerText()).trim(),"非公開");
  assert.equal((await card.getByTestId("signage-operated").locator("td").nth(1).innerText()).trim(),"非公開");
  checks.push("DBで非公開になった購入・Signage指標を非公開と表示");
  await fixture!.db.query("update ad_calls set disclosure_scope=$1 where id=$2",[["purchases"],metricId("8",1)]);
  await page.reload();await card.getByTestId("app-operated").waitFor();
  assert.equal((await card.getByTestId("app-operated").locator("td").nth(1).innerText()).trim(),"非公開");
  assert.equal(await card.getByTestId("app-operated").getByText("少数のため参考値",{exact:true}).count(),0);
  checks.push("表示数が非公開なら少数の判定も表示しない");
  outage=true;await page.reload();
  await shown(page,"認証・DBへ接続できません。時間をおいて再試行してください。");
  assert.equal(await page.getByTestId("app-operated").count(),0);
  checks.push("集計失敗を0件や前の結果に置き換えない");
  outage=false;
  await fixture!.db.query("update ad_calls set disclosure_scope=$1 where id=$2",[["impressions","clicks","cart_adds","purchases","signage_views"],metricId("8",1)]);
  await page.reload();await card.getByTestId("app-operated").waitFor();
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:new URL("ads04-results-mobile.png",images).pathname,fullPage:true});
  checks.push("表だけ横スクロールし、スマホ画面全体は横にはみ出さない");
  await page.getByRole("button",{name:"ログアウト",exact:true}).click();
  await shown(page,"メーカーとしてログイン");
  assert.equal(await page.getByTestId("app-operated").count(),0);
  checks.push("ログアウト後の成果非表示");
  await login(page,"maker-two@example.test");
  await page.getByTestId("result-"+metricId("c",2)).waitFor();
  assert.equal(await page.getByTestId("result-"+metricId("c",1)).count(),0);
  checks.push("メーカーを替えても前の会社の成果を残さない");
  const storeCtx=await context(),storePage=await storeCtx.newPage();
  await storePage.goto(base+"/ads/maker/results");await login(storePage,"store@example.test","store_staff");
  await shown(storePage,"成果画面はメーカー向けです。");
  assert.equal(await storePage.getByTestId("app-operated").count(),0);
  checks.push("店舗アカウントではメーカー成果を開けない");
 }
 assert.deepEqual(errors,[]);checks.push("ブラウザの未処理エラーなし");
 console.log(checks.map((s,i)=>(i+1)+". "+s).join("\n"));
 console.log("Results browser checks passed: "+checks.length+" ("+(mock?"mock":"formal SQL/RLS; Auth/HTTP simulated")+")");
}catch(e){
 for(const ctx of browser?.contexts()??[])for(const p of ctx.pages())console.log("Fixture screen:",await p.locator("body").innerText());
 throw e;
}finally{await browser?.close();server?.kill();await fixture?.close();}
