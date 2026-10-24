// APP-09: Next UI/API + real Supabase client + official SQL/RLS on a disposable PGlite.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium,type Page,type Route } from "playwright";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";
import type { CheckoutContext,CheckoutIntent } from "../src/features/checkout/contracts.ts";

const fixture=await createCartBackend({offers:true});
await fixture.db.query("insert into customer_settings(user_id,use_purchase_history,use_current_cart) values ($1,true,true)",[id(3)]);
const origin="http://127.0.0.1:3119",output=resolve("../../internal/app09-evidence");await mkdir(output,{recursive:true});
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port","3119"],{
  env:{...process.env,KAGO_NEXT_DIST_DIR:".next/app09-e2e",KAGO_DEMO_ENABLED:"0",NEXT_PUBLIC_SUPABASE_URL:fixture.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test"},
  windowsHide:true,stdio:["ignore","pipe","pipe"],
});
let log="";server.stdout.on("data",c=>{log+=c;});server.stderr.on("data",c=>{log+=c;});
let browser,page:Page|undefined;const passed:string[]=[],pass=(message:string)=>{passed.push(message);console.log("PASS: "+message);};
async function until(check:()=>Promise<boolean>) {for(let i=0;i<200;i++){if(await check())return;await delay(50);}throw Error("Condition did not become true");}
const countOrders=async(visit:string)=>(await fixture.db.query<{n:number}>("select count(*)::int n from orders where visit_id=$1",[visit])).rows[0].n;
try {
  for(let i=0;i<60;i++){if(server.exitCode!==null)throw Error(log);try{if((await fetch(origin+"/api/shopping")).status===401)break;}catch{/* starting */}if(i===59)throw Error(log);await delay(1000);}
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH??"C:/Program Files/Google/Chrome/Application/chrome.exe"});
  const context=await browser.newContext({viewport:{width:375,height:812}});page=await context.newPage();const p=page;p.setDefaultTimeout(30000);
  const errors:string[]=[];p.on("pageerror",e=>errors.push(e.message));
  let intercept:((route:Route)=>Promise<void>)|null=null;const attempts:CheckoutIntent[]=[];
  await p.route("**/api/checkout*",async route=>{
    if(route.request().method()==="POST"){attempts.push(route.request().postDataJSON());if(intercept){await intercept(route);return;}}
    await route.continue();
  });
  const checkout=async(visit?:string)=>await (await context.request.get(origin+"/api/checkout"+(visit?`?visitId=${visit}`:""))).json() as CheckoutContext;
  const cart=async()=>(await (await context.request.get(origin+"/api/cart")).json());
  const saved=()=>p.getByText("かごを保存しました。",{exact:true}).waitFor();
  const complete=()=>p.getByRole("heading",{name:"疑似購入が完了しました",exact:true}).waitFor();
  const review=()=>p.getByRole("button",{name:"この内容で疑似購入を確定",exact:true}).waitFor();
  const addMilk=async()=>{await p.getByRole("button",{name:"検証ミルクをかごに追加",exact:true}).click();await saved();};
  const openCheckout=async()=>{await p.getByRole("button",{name:/買い物かごを開く/}).click();await p.getByRole("link",{name:"疑似購入の確認へ",exact:true}).click();await review();};
  const nextVisit=async()=>{
    await p.getByRole("link",{name:"次の買い物へ",exact:true}).click();
    await p.getByRole("button",{name:"この店舗で買い物を始める",exact:true}).first().click();
    await p.getByText("かごを最新の状態にしました。",{exact:true}).waitFor();return (await cart()).visit.id as string;
  };
  const login=async(user:number)=>{
    const r=await context.request.post(origin+"/api/shopping",{headers:{Origin:origin},data:{action:"login",email:`user${user}@example.test`,password:"fixture-password"}});assert.equal(r.status(),200);
  };
  await p.goto(origin+"/App");await p.getByLabel("メールアドレス").fill("user3@example.test");await p.getByLabel("パスワード",{exact:true}).fill("fixture-password");
  await p.getByRole("button",{name:"ログイン",exact:true}).click();await p.getByRole("button",{name:"続きから開く",exact:true}).first().click();
  await p.getByRole("button",{name:"検証ミルクをかごに追加",exact:true}).waitFor();
  await p.getByRole("button",{name:/買い物かごを開く/}).click();assert(await p.getByRole("button",{name:"疑似購入の確認へ",exact:true}).isDisabled());await p.getByRole("button",{name:"閉じる",exact:true}).click();
  await addMilk();await openCheckout();
  const firstQuote=await checkout();assert(firstQuote.state==="review");assert.equal(firstQuote.quote.total,248);
  await p.getByText("デモ用の疑似購入です。実際の支払い・カード決済は発生しません。",{exact:true}).waitFor();
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  intercept=async route=>{const response=await route.fetch();await gate;await route.fulfill({response});};
  await p.getByRole("button",{name:"この内容で疑似購入を確定",exact:true}).click();
  await until(async()=>await countOrders(id(13))===1);
  assert(await p.getByRole("button",{name:"購入結果を確認しています…",exact:true}).isDisabled());
  assert.equal(attempts.length,1);release();intercept=null;await complete();await p.reload();await complete();
  assert.equal(attempts.length,1);assert.equal(await countOrders(id(13)),1);
  const firstReceipt=await checkout();assert(firstReceipt.state==="complete");
  pass("empty cart cannot enter checkout; one confirm saves an order, locks repeat presses, and reload keeps the completed receipt");

  const secondVisit=await nextVisit();assert.notEqual(secondVisit,id(13));
  await p.getByRole("link",{name:"マイページを開く"}).click();
  await p.getByRole("region",{name:"この店舗での購入履歴"}).getByText("検証ミルク",{exact:true}).waitFor();
  await p.getByText("Appでの疑似購入",{exact:true}).waitFor();
  const input=await (await context.request.get(origin+"/api/recommendation-input")).json();
  assert(input.history.orders.some((o:{id:string})=>o.id===firstReceipt.receipt.orderId));
  assert(input.history.summaries.some((s:{productId:string})=>s.productId===id(20)));
  await p.getByRole("link",{name:"買い物画面へ戻る",exact:true}).click();await addMilk();await openCheckout();
  await fixture.db.query("update store_products set price=278 where store_id=$1 and product_id=$2",[id(1),id(20)]);
  await p.getByRole("button",{name:"この内容で疑似購入を確定",exact:true}).click();
  await p.getByText("価格や割引が変わりました。最新の明細と合計を確認して、もう一度確定してください。",{exact:true}).waitFor();
  assert.equal(await countOrders(secondVisit),0);const changed=await checkout();assert(changed.state==="review");assert.equal(changed.quote.total,278);
  await p.screenshot({path:resolve(output,"price-changed-mobile.png"),fullPage:true});
  await fixture.rpc("app_set_cart_item",[secondVisit,crypto.randomUUID(),id(20),2,1,"manual",null]);
  await p.getByRole("button",{name:"この内容で疑似購入を確定",exact:true}).click();
  await p.getByText("かごが変更されました。最新の内容を確認して、もう一度確定してください。",{exact:true}).waitFor();
  assert.equal(await countOrders(secondVisit),0);
  pass("next visit shows the order in history/recommendation input; changed prices and cart versions require a new explicit confirmation");

  intercept=async route=>{await route.abort("failed");};
  await p.getByRole("button",{name:"この内容で疑似購入を確定",exact:true}).click();
  await p.getByRole("button",{name:"同じ購入操作を再試行",exact:true}).waitFor();const failed=attempts.at(-1)!;
  assert.equal(await countOrders(secondVisit),0);await p.reload();
  await p.getByRole("button",{name:"同じ購入操作を再試行",exact:true}).waitFor();intercept=null;
  await p.getByRole("button",{name:"同じ購入操作を再試行",exact:true}).click();await complete();
  assert.deepEqual(attempts.at(-1),failed);assert.equal(await countOrders(secondVisit),1);
  pass("a pre-write connection failure survives reload and retries the same user/visit/key/version/total exactly once");

  const discountVisit=await nextVisit();
  await p.getByLabel("商品コードを入力",{exact:true}).fill("2900000000100");await p.getByRole("button",{name:"コードで追加",exact:true}).click();await saved();
  await p.getByRole("button",{name:"セットでかごに追加（トマトパスタソースを追加）",exact:true}).click();await saved();await openCheckout();
  const discount=await checkout();assert(discount.state==="review");assert.equal(discount.quote.subtotal,546);assert.equal(discount.quote.discountTotal,53);assert.equal(discount.quote.total,493);
  await p.getByRole("region",{name:"購入明細"}).getByText("セット割",{exact:false}).first().waitFor();
  await p.screenshot({path:resolve(output,"confirmation-mobile.png"),fullPage:true});
  intercept=async route=>{await route.fetch();await route.abort("failed");};
  await p.getByRole("button",{name:"この内容で疑似購入を確定",exact:true}).click();
  await p.getByRole("button",{name:"同じ購入操作を再試行",exact:true}).waitFor();const lost=attempts.at(-1)!;assert.equal(lost.expectedTotal,493);
  assert.equal(await countOrders(discountVisit),1);await p.reload();await complete();intercept=null;
  assert.equal(await p.evaluate(()=>sessionStorage.getItem("kago-checkout-pending:00000000-0000-4000-8000-000000000003")),null);
  await p.screenshot({path:resolve(output,"complete-mobile.png"),fullPage:true});
  const replay=await context.request.post(origin+"/api/checkout",{headers:{Origin:origin},data:lost});assert.equal(replay.status(),200);assert.equal((await replay.json()).replayed,true);
  assert.equal(await countOrders(discountVisit),1);
  pass("set discounts agree with the cart; a lost post-commit acknowledgement reloads the stored receipt and replay never creates another order");

  const switched=await context.request.post(origin+"/api/shopping",{headers:{Origin:origin},data:{action:"start_visit",storeId:id(2),startNew:false,previousVisitId:null}});assert.equal(switched.status(),200);
  await p.reload();await complete();assert(p.url().includes(discountVisit));
  pass("receipt URL stays on the completed visit even after another tab changes the selected store");

  const other=await browser.newContext({viewport:{width:320,height:720}});
  assert.equal((await other.request.post(origin+"/api/shopping",{headers:{Origin:origin},data:{action:"login",email:"user4@example.test",password:"fixture-password"}})).status(),200);
  assert.equal((await other.request.get(origin+`/api/checkout?visitId=${discountVisit}`)).status(),403);
  assert.equal((await other.request.post(origin+"/api/checkout",{headers:{Origin:origin},data:lost})).status(),403);
  assert.equal((await context.request.post(origin+"/api/checkout",{headers:{Origin:"https://other.example"},data:lost})).status(),403);
  const anonymous=await browser.newContext();assert.equal((await anonymous.request.post(origin+"/api/checkout",{headers:{Origin:origin},data:lost})).status(),401);await anonymous.close();
  await other.request.post(origin+"/api/shopping",{headers:{Origin:origin},data:{action:"start_visit",storeId:id(1),startNew:false,previousVisitId:null}});
  const foreign=await other.newPage();let foreignPosts=0;foreign.on("request",r=>{if(r.url().includes("/api/checkout")&&r.method()==="POST")foreignPosts++;});
  await foreign.goto(origin+"/App/checkout");await foreign.evaluate(value=>sessionStorage.setItem("kago-checkout-pending:00000000-0000-4000-8000-000000000003",JSON.stringify(value)),lost);await foreign.reload();
  await foreign.getByText("かごが空のため購入できません。",{exact:true}).waitFor();assert.equal(foreignPosts,0);
  assert(await foreign.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await other.close();
  pass("foreign receipts/requests, anonymous and cross-origin writes are rejected; another user's local pending intent is never posted");

  await fixture.rpc("app_set_cart_item",[id(14),crypto.randomUUID(),id(20),1,0,"manual",null]);await p.goto(origin+"/App/checkout");await review();
  const beforeStorage=attempts.length;
  await p.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException("test denied","QuotaExceededError");};});
  await p.getByRole("button",{name:"この内容で疑似購入を確定",exact:true}).click();
  await p.getByText("購入操作を安全に保存できません。ブラウザのストレージ設定を確認して再試行してください。",{exact:true}).waitFor();
  assert.equal(attempts.length,beforeStorage);assert.equal(await countOrders(id(14)),0);await p.reload();await review();
  pass("disabled storage prevents sending a purchase whose retry key cannot be retained");

  let releaseOld!:()=>void;const oldGate=new Promise<void>(resolve=>{releaseOld=resolve;});
  intercept=async route=>{const response=await route.fetch();await oldGate;try{await route.fulfill({response});}catch{/* Original identity boundary aborted this browser request. */}};
  await p.getByRole("button",{name:"この内容で疑似購入を確定",exact:true}).click();await until(async()=>await countOrders(id(14))===1);
  await login(4);
  await p.evaluate(()=>{const c=new BroadcastChannel("kago-shopping-session");c.postMessage("identity_changed");c.close();});
  await p.getByText("購入できる来店がありません。買い物画面から店舗・来店を選んでください。",{exact:true}).waitFor();
  releaseOld();intercept=null;await delay(300);assert.equal(await p.getByRole("heading",{name:"疑似購入が完了しました",exact:true}).count(),0);
  await login(3);await p.reload();await complete();assert(p.url().includes(id(14)));assert.equal(await countOrders(id(14)),1);
  pass("identity change hides private data and discards a late old response; signing back in recovers that user's original completed purchase");
  assert.equal(errors.length,0,errors.join("\n"));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await writeFile(resolve(output,"result.json"),JSON.stringify({passed},null,2));console.log(`${passed.length} browser/DB scenarios passed.`);
} catch(error) {
  if(page){await page.screenshot({path:resolve(output,"failure.png"),fullPage:true});console.log((await page.locator("body").innerText()).slice(0,2200));}
  await writeFile(resolve(output,"server.log"),log);throw error;
} finally {await browser?.close();server.kill();await fixture.close();}
