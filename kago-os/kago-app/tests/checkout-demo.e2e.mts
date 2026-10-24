// Demo mode uses server-only customer sessions; completion must not silently create a new visit.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";

const fixture=await createCartBackend({demoUsers:true}),origin="http://127.0.0.1:3120";
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port","3120"],{
  env:{...process.env,KAGO_NEXT_DIST_DIR:".next/app09-demo",NEXT_PUBLIC_SUPABASE_URL:fixture.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test",
    KAGO_DEMO_ENABLED:"1",KAGO_DEMO_STORE_ID:id(1),KAGO_DEMO_U1_EMAIL:"misaki.sato@example.test",KAGO_DEMO_U1_PASSWORD:"fixture-password",
    KAGO_DEMO_U2_EMAIL:"ken.tanaka@example.test",KAGO_DEMO_U2_PASSWORD:"fixture-password",KAGO_DEMO_U3_EMAIL:"yui.suzuki@example.test",KAGO_DEMO_U3_PASSWORD:"fixture-password"},
  windowsHide:true,stdio:["ignore","pipe","pipe"],
});
let log="";server.stdout.on("data",c=>{log+=c;});server.stderr.on("data",c=>{log+=c;});let browser;
try {
  for(let i=0;i<60;i++){if(server.exitCode!==null)throw Error(log);try{if((await fetch(origin+"/api/shopping")).status===200)break;}catch{/* starting */}if(i===59)throw Error(log);await delay(1000);}
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH??"C:/Program Files/Google/Chrome/Application/chrome.exe"});
  const context=await browser.newContext({viewport:{width:375,height:812}}),page=await context.newPage();page.setDefaultTimeout(30000);
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  const buy=async()=>{
    await page.getByRole("button",{name:/買い物かごを開く/}).click();await page.getByRole("link",{name:"疑似購入の確認へ",exact:true}).click();
    await page.getByRole("button",{name:"この内容で疑似購入を確定",exact:true}).click();await page.getByRole("heading",{name:"疑似購入が完了しました",exact:true}).waitFor();
    return await (await context.request.get(origin+"/api/checkout"+new URL(page.url()).search)).json();
  };
  await page.goto(origin+"/App");await page.getByRole("button",{name:"検証ミルクをかごに追加",exact:true}).click();await page.getByText("かごを保存しました。",{exact:true}).waitFor();
  await page.getByRole("button",{name:/買い物かごを開く/}).click();await page.getByRole("link",{name:"疑似購入の確認へ",exact:true}).click();
  await page.getByRole("button",{name:"この内容で疑似購入を確定",exact:true}).click();await page.getByRole("heading",{name:"疑似購入が完了しました",exact:true}).waitFor();
  const first=await (await context.request.get(origin+"/api/checkout?visitId="+id(13))).json();assert.equal(first.state,"complete");assert.equal(first.userId,id(3));
  await page.reload();await page.getByRole("heading",{name:"疑似購入が完了しました",exact:true}).waitFor();
  assert.equal((await fixture.db.query("select * from visits where user_id=$1 and store_id=$2 and status='active'",[id(3),id(1)])).rows.length,0);
  await page.getByRole("link",{name:"次の買い物へ",exact:true}).click();await page.getByRole("button",{name:"検証ミルクをかごに追加",exact:true}).waitFor();
  const next=await (await context.request.get(origin+"/api/shopping")).json();assert.equal(next.userId,id(3));assert.notEqual(next.visit.id,id(13));
  await page.getByRole("link",{name:"マイページを開く"}).click();await page.getByRole("region",{name:"この店舗での購入履歴"}).getByText("検証ミルク",{exact:true}).waitFor();
  console.log("PASS: demo auto-login purchases once, reload preserves completion, and next shopping automatically starts a new visit with history");
  await page.getByRole("link",{name:"買い物画面へ戻る",exact:true}).click();await page.getByLabel("デモ利用者を切り替える",{exact:true}).selectOption("U2");
  await page.getByRole("button",{name:"検証りんごをかごに追加",exact:true}).click();await page.getByText("かごを保存しました。",{exact:true}).waitFor();
  const second=await buy();assert.equal(second.state,"complete");assert.equal(second.userId,id(4));assert.equal(second.receipt.total,158);
  assert.equal((await context.request.get(origin+"/api/checkout?visitId="+id(13))).status(),403);
  await page.getByRole("link",{name:"次の買い物へ",exact:true}).click();await page.getByLabel("デモ利用者を切り替える",{exact:true}).selectOption("U1");
  await page.getByRole("link",{name:"マイページを開く"}).click();const history=page.getByRole("region",{name:"この店舗での購入履歴"});await history.getByText("検証ミルク",{exact:true}).waitFor();
  assert.equal(await history.getByText("検証りんご",{exact:true}).count(),0);assert.equal(errors.length,0,errors.join("\n"));
  console.log("PASS: demo persona purchases and receipts remain per customer; switching back keeps only that customer's history");
} finally {await browser?.close();server.kill();await fixture.close();}
