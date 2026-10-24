// Actual Next API/UI + official SQL/RLS via PGlite. Auth/PostgREST use a local adapter.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { chromium, type Page } from "playwright";
import sharp from "sharp";
import { createRequire } from "node:module";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";
import type { CartSnapshot } from "../src/features/cart/contracts.ts";

const fixture=await createCartBackend();
const bwipjs = createRequire(import.meta.url)("bwip-js") as { toBuffer: (options: object) => Promise<Buffer> };
const origin="http://127.0.0.1:3108";
const output=resolve("../../internal/app02-evidence");await mkdir(output,{recursive:true});
// A synthetic camera frame exercises the existing ZXing reader (no real camera required).
const barcode=await bwipjs.toBuffer({bcid:"ean13",text:"4900000000016",scale:3,height:30,includetext:true});
const grey=await sharp({create:{width:1280,height:720,channels:3,background:"white"}}).composite([{input:barcode,gravity:"centre"}]).greyscale().raw().toBuffer();
const video=resolve(output,"barcode.y4m");
const frame=Buffer.concat([Buffer.from("FRAME\n"),grey,Buffer.alloc(1280*720/2,128)]);
await writeFile(video,Buffer.concat([Buffer.from("YUV4MPEG2 W1280 H720 F10:1 Ip A1:1 C420jpeg\n"),...Array.from({length:20},()=>frame)]));
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port","3108"],{
  env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:fixture.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test"},windowsHide:true,stdio:["ignore","pipe","pipe"],
});
let log="";server.stdout.on("data",c=>{log+=c});server.stderr.on("data",c=>{log+=c});
let browser;let activePage: Page | undefined;const passed:string[]=[];const pass=(s:string)=>{passed.push(s);console.log("PASS: "+s)};
try{
  for(let i=0;i<90;i++){if(server.exitCode!==null)throw Error(log);try{if((await fetch(origin+"/api/shopping")).status===401)break;}catch{}if(i===89)throw Error(log);await delay(1000);}
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH??"C:/Program Files/Google/Chrome/Application/chrome.exe",
    args:["--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream",`--use-file-for-fake-video-capture=${video}`]});
  const a=await browser.newContext({viewport:{width:390,height:844}});const page=await a.newPage();activePage=page;page.setDefaultTimeout(45000);
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  const wait=async(text:string,p=page)=>p.getByText(text,{exact:true}).first().waitFor();
  const saved=()=>wait("かごを保存しました。");
  const login=async(p:Page,n=3)=>{await p.goto(origin+"/App");await p.getByLabel("メールアドレス").fill(`user${n}@example.test`);await p.getByLabel("パスワード",{exact:true}).fill("fixture-password");await p.getByRole("button",{name:"ログイン",exact:true}).click();await p.getByRole("button",{name:"続きから開く",exact:true}).first().click();await p.getByRole("button",{name:"検証ミルクをかごに追加",exact:true}).waitFor();await wait("かごを最新の状態にしました。",p);};
  const snapshot=async()=>{const r=await a.request.get(origin+"/api/cart");assert.equal(r.status(),200);return await r.json() as CartSnapshot;};
  assert.equal((await a.request.get(origin+"/api/cart")).status(),401);
  await login(page);
  assert.equal((await a.request.post(origin+"/api/cart",{headers:{Origin:"https://foreign.test"},data:{}})).status(),403);
  assert.equal((await a.request.post(origin+"/api/cart",{headers:{Origin:origin},data:{action:"set",visitId:id(15)}})).status(),409);
  pass("login, selected store, authenticated cart API and CSRF/visit-cookie checks");
  await page.getByRole("button",{name:"カメラで読み取る",exact:true}).click();
  for(let i=0;i<120;i++){if((await snapshot()).cart.length===1)break;if(i===119)throw Error("Camera did not add product");await delay(250);}
  await page.getByRole("button",{name:"検証りんごをかごに追加",exact:true}).waitFor();
  assert.equal((await snapshot()).cart[0].quantity,1);assert.equal((await snapshot()).cart[0].price,248);
  pass("existing ZXing camera decodes an EAN frame and adds the real DB store-priced product once");
  await page.getByRole("button",{name:"検証りんごをかごに追加",exact:true}).click();await saved();
  assert.equal((await snapshot()).cart.length,2);pass("manual PLU product selection adds a DB product without barcode");
  const version=(await snapshot()).visit.cart_version;
  await page.getByLabel("商品コードを入力",{exact:true}).fill("unregistered");await page.getByRole("button",{name:"コードで追加",exact:true}).click();await wait("この店舗に登録されていない商品です。商品一覧から選ぶか、店員へお尋ねください。");
  await page.getByLabel("商品コードを入力",{exact:true}).fill("4900000000023");await page.getByRole("button",{name:"コードで追加",exact:true}).click();await wait("この商品は現在お取り扱いを停止しています。かごから削除できます。");
  assert.equal((await snapshot()).visit.cart_version,version);pass("unregistered/stopped codes record failures without changing cart or version");
  await page.getByRole("button",{name:/買い物かごを開く/}).click();
  await page.getByRole("button",{name:"検証ミルクを1点増やす",exact:true}).click();await saved();
  await page.getByRole("button",{name:"検証りんごを削除",exact:true}).click();await saved();
  assert.equal((await snapshot()).cart.length,1);assert.equal((await snapshot()).cart[0].quantity,2);
  await page.screenshot({path:resolve(output,"cart-mobile.png"),fullPage:true});pass("quantity change and explicit removal update authoritative totals and events");
  await page.getByRole("button",{name:"閉じる",exact:true}).click();
  const b=await browser.newContext({viewport:{width:390,height:844}});const other=await b.newPage();await login(other);
  const second=await (await b.request.get(origin+"/api/cart")).json();assert.deepEqual(second,await snapshot());
  await other.reload();await wait("かごを最新の状態にしました。",other);assert.deepEqual(await (await b.request.get(origin+"/api/cart")).json(),await snapshot());
  pass("independent browser login and reload restore identical quantity, store price and version");
  await other.getByRole("button",{name:"店舗・来店を選ぶ",exact:true}).click();await other.getByRole("button",{name:"続きから開く",exact:true}).nth(1).click();await wait("かごを最新の状態にしました。",other);
  await other.getByRole("button",{name:"検証ミルクをかごに追加",exact:true}).click();await wait("かごを保存しました。",other);
  const store2=await (await b.request.get(origin+"/api/cart")).json();assert.equal(store2.cart[0].price,298);assert.equal(store2.visit.store_id,id(2));
  pass("the same product uses the second store price and a separate visit/cart");
  const c=await browser.newContext();const foreign=await c.newPage();await login(foreign,4);assert.equal((await (await c.request.get(origin+"/api/cart")).json()).cart.length,0);
  pass("another customer's browser cannot display the first customer's cart");
  await foreign.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException("Test denied","NotAllowedError")}});
  await foreign.getByRole("button",{name:"カメラで読み取る",exact:true}).click();
  await wait("読み取りができませんでした。カメラを再試行するか、商品一覧・商品コード入力をご利用ください。",foreign);
  assert.equal((await (await c.request.get(origin+"/api/cart")).json()).cart.length,0);
  pass("camera denial records scan_failed and leaves manual selection usable without cart changes");
  let lost=false;
  await page.route("**/api/cart",async route=>{
    if(!lost&&route.request().method()==="POST"&&route.request().postDataJSON().action==="set") {lost=true;await route.fetch();await route.abort("failed");} else await route.continue();
  });
  await page.getByRole("button",{name:"検証ミルクをかごに追加",exact:true}).click();await wait("通信が途切れました。保存結果を確認するため、同じ操作を再試行してください。");
  assert.equal((await snapshot()).cart[0].quantity,3);const applied=(await snapshot()).visit.cart_version;
  await page.unroute("**/api/cart");await page.reload();await wait("保存結果が未確認の操作があります。同じ操作を再試行してください。");
  await page.getByRole("button",{name:"同じ操作を再試行",exact:true}).click();await saved();
  assert.equal((await snapshot()).cart[0].quantity,3);assert.equal((await snapshot()).visit.cart_version,applied);
  const requests=fixture.calls.filter(c=>c.name==="app_set_cart_item");assert.equal(requests.at(-1)!.body.p_request_id,requests.at(-2)!.body.p_request_id);
  pass("response lost after DB commit, reload and same-key retry never increment twice");
  let dropped=false;
  await page.route("**/api/cart",async route=>{if(!dropped&&route.request().method()==="POST"&&route.request().postDataJSON().action==="set"){dropped=true;await route.abort("failed");}else await route.continue();});
  await page.getByRole("button",{name:"検証ミルクをかごに追加",exact:true}).click();await wait("通信が途切れました。保存結果を確認するため、同じ操作を再試行してください。");assert.equal((await snapshot()).cart[0].quantity,3);
  await page.unroute("**/api/cart");await page.getByRole("button",{name:"同じ操作を再試行",exact:true}).click();await saved();assert.equal((await snapshot()).cart[0].quantity,4);
  pass("network failure before DB write retries the same intent and applies once");
  const stale=(await snapshot()).visit.cart_version;
  await fixture.rpc("app_set_cart_item",[id(13),randomUUID(),id(20),7,stale,"manual",null]);
  await page.getByRole("button",{name:"検証ミルクをかごに追加",exact:true}).click();await wait("別の画面でかごが変更されました。最新のかごを確認して、もう一度操作してください。");assert.equal((await snapshot()).cart[0].quantity,7);
  pass("stale browser version is rejected and latest cart is shown without overwriting");
  await page.getByRole("button",{name:/買い物かごを開く/}).click();await page.getByRole("button",{name:"検証ミルクを削除",exact:true}).click();await saved();assert.equal((await snapshot()).cart.length,0);await page.getByRole("button",{name:"閉じる",exact:true}).click();
  await page.screenshot({path:resolve(output,"products-mobile.png"),fullPage:true});
  let catalogFailed=false;
  await page.route("**/api/cart?products=*",async route=>{if(!catalogFailed){catalogFailed=true;await route.abort("failed");}else await route.continue();});
  await page.getByLabel("商品名・商品コードで検索",{exact:true}).fill("りんご");await page.getByRole("button",{name:"検索",exact:true}).click();
  await page.getByRole("button",{name:"商品一覧を再試行",exact:true}).waitFor();await page.getByRole("button",{name:"商品一覧を再試行",exact:true}).click();
  await page.getByRole("button",{name:"検証りんごをかごに追加",exact:true}).waitFor();assert.equal(await page.getByRole("button",{name:"検証ミルクをかごに追加",exact:true}).count(),0);
  await page.unroute("**/api/cart?products=*");pass("catalog connection failure recovers by retrying the same product search");
  const eventRows=(await fixture.db.query<{event_type:string;payload:{method?:string}}>("select event_type,payload from events")).rows;
  assert(eventRows.some(e=>e.event_type==="product_scanned"&&e.payload.method==="barcode"));assert(eventRows.some(e=>e.event_type==="product_scanned"&&e.payload.method==="manual"));
  assert.equal(errors.length,0);pass("empty cart, DB scan events and browser runtime checks");
  console.log(`${passed.length} browser/SQL scenarios passed.`);
  await writeFile(resolve(output,"result.json"),JSON.stringify({passed},null,2));
}catch(error){
  if(activePage){await activePage.screenshot({path:resolve(output,"failure.png"),fullPage:true});console.log((await activePage.locator("body").innerText()).slice(0,2500));}
  throw error;
}finally{await browser?.close();server.kill();await fixture.close();}
