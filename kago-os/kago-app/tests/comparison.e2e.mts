import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { seedEventSuggestions } from "./fixtures/app-events.mts";
import type { AppEvent } from "../src/features/events/contracts.ts";

const fixture=await createCartBackend({offers:true});await seedEventSuggestions(fixture);
const base="http://127.0.0.1:3327";
const output=resolve("../../internal/app11-evidence");await mkdir(output,{recursive:true});
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port","3327"],{
 env:{...process.env,KAGO_NEXT_DIST_DIR:".next/app11-e2e",KAGO_DEMO_ENABLED:"0",NEXT_PUBLIC_SUPABASE_URL:fixture.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test"},
 stdio:["ignore","pipe","pipe"],windowsHide:true
});
let log="";server.stdout.on("data",x=>{log+=x;});server.stderr.on("data",x=>{log+=x;});
let browser;let activePage:import("playwright").Page|undefined;const passed:string[]=[];const pass=(s:string)=>{passed.push(s);console.log("PASS "+s);};
async function count(){return (await fixture.db.query<{n:number}>("select count(*)::int n from events where event_type='product_compared'")).rows[0].n;}
async function until(check:()=>Promise<boolean>){for(let i=0;i<100;i++){if(await check())return;await delay(100);}throw Error("Condition timed out");}
try{
 for(let i=0;i<70;i++){try{if((await fetch(base+"/api/shopping")).status===401)break;}catch{}if(i===69||server.exitCode!==null)throw Error(log);await delay(1000);}
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH??"/usr/bin/google-chrome"});
 const context=await browser.newContext({viewport:{width:390,height:844},permissions:[]});
 const page=await context.newPage();activePage=page;page.setDefaultTimeout(30000);const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(base+"/App");await page.getByLabel("メールアドレス").fill("user3@example.test");await page.getByLabel("パスワード",{exact:true}).fill("fixture-password");await page.getByRole("button",{name:"ログイン",exact:true}).click();
 await page.getByRole("button",{name:"前回の店舗から再開",exact:true}).first().click();
 await page.getByLabel("商品名・商品コードで検索").fill("");
 await page.getByRole("button",{name:"検索",exact:true}).click();
 const picker=page.getByRole("dialog");await picker.getByRole("checkbox").first().waitFor();assert.ok(await picker.getByRole("button",{name:"選んだ商品を比較",exact:true}).isDisabled());
 await picker.getByRole("checkbox").nth(0).check();assert.ok(await picker.getByRole("button",{name:"選んだ商品を比較",exact:true}).isDisabled());
 await picker.getByRole("checkbox").nth(1).check();assert.equal(await count(),0);pass("選択だけでは比較を記録せず、2商品以上で比較できる");
 const attempts:AppEvent[]=[];
 await page.route("**/api/events",async route=>{const body=route.request().postDataJSON() as AppEvent;if(body.event_type==="product_compared"){attempts.push(body);await route.fetch();await route.abort("failed");}else await route.continue();});
 await picker.getByRole("button",{name:"選んだ商品を比較",exact:true}).click();
 await page.getByRole("heading",{name:"商品を比較",exact:true}).waitFor();
 await until(async()=>await count()===1);assert.equal(await page.getByRole("table").getByRole("columnheader").count(),3);
 const first=attempts[0];assert(first.event_type==="product_compared");assert.equal(first.payload.product_ids.length,2);
 const stored=(await fixture.db.query<{payload:{product_ids:string[]};visit_id:string;occurred_at:string}>("select payload,visit_id,occurred_at from events where event_id=$1",[first.event_id])).rows[0];
 assert.deepEqual(stored.payload.product_ids,first.payload.product_ids);assert.equal(stored.visit_id,first.visit_id);
 assert.equal(new Date(stored.occurred_at).toISOString(),first.occurred_at);
 await mkdir(resolve("../../docs/images"),{recursive:true});await page.screenshot({path:resolve("../../docs/images/app11-comparison-mobile.png"),fullPage:true});
 await page.setViewportSize({width:1280,height:900});await delay(300);assert.equal(await count(),1);
 await page.screenshot({path:resolve("../../docs/images/app11-comparison-desktop.png"),fullPage:true});pass("比較表の2商品・来店・元時刻が保存され、再描画で増えない");
 await page.unroute("**/api/events");await page.evaluate(()=>window.dispatchEvent(new Event("online")));
 await until(async()=>!(await page.evaluate(()=>JSON.parse(sessionStorage.getItem("kago-events:00000000-0000-4000-8000-000000000003")??"[]"))).some((e:AppEvent)=>e.event_type==="product_compared"));
 assert.equal(await count(),1);pass("保存後に応答を失っても元IDで再送し、DBは1件");
 await page.getByRole("button",{name:"商品選択に戻る",exact:true}).click();
 assert.equal(await page.getByRole("checkbox",{checked:true}).count(),2);await page.getByRole("button",{name:"選んだ商品を比較",exact:true}).click();await until(async()=>await count()===2);
 await page.getByRole("button",{name:"商品選択に戻る",exact:true}).click();await page.getByRole("button",{name:"比較の選択を解除",exact:true}).click();assert.equal(await page.getByRole("checkbox",{checked:true}).count(),0);
 const boxes=page.getByRole("checkbox");if(await boxes.count()>=5){for(let i=0;i<4;i++)await boxes.nth(i).check();assert.ok(await boxes.nth(4).isDisabled());}
 pass("比較を開き直す操作は別件、選択解除と4商品上限を保持");
 const forged={...first,event_id:crypto.randomUUID(),visit_id:"00000000-0000-4000-8000-000000000014"};
 assert.equal((await context.request.post(base+"/api/events",{headers:{Origin:base},data:forged})).status(),403);
 const invalid={...first,event_id:crypto.randomUUID(),payload:{product_ids:[...first.payload.product_ids.slice(0,1),"00000000-0000-4000-8000-999999999999"]}};
 assert.equal((await context.request.post(base+"/api/events",{headers:{Origin:base},data:invalid})).status(),400);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 pass("他人の来店・店舗にない商品の比較を拒否し、390pxでページ横はみ出しなし");
 const noCompare=await browser.newContext({viewport:{width:390,height:844},permissions:[]});
 const post=(path:string,data:object)=>noCompare.request.post(base+path,{headers:{Origin:base},data});
 assert.equal((await post("/api/shopping",{action:"login",email:"user4@example.test",password:"fixture-password"})).status(),200);
 assert.equal((await post("/api/shopping",{action:"start_visit",storeId:"00000000-0000-4000-8000-000000000001",startNew:false,previousVisitId:"00000000-0000-4000-8000-000000000015"})).status(),200);
 const snap=await (await noCompare.request.get(base+"/api/cart")).json();
 assert.equal((await post("/api/cart",{action:"set",visitId:snap.visit.id,requestId:crypto.randomUUID(),expectedVersion:snap.visit.cart_version,productId:"00000000-0000-4000-8000-000000000020",quantity:1,source:"manual"})).status(),200);
 const purchase=await noCompare.newPage();await purchase.goto(base+"/App/checkout");
 await purchase.getByRole("button",{name:"お会計を確定する",exact:true}).click();
 await purchase.getByRole("heading",{name:"お買い物が完了しました",exact:true}).waitFor();
 assert.equal((await fixture.db.query<{n:number}>("select count(*)::int n from orders where visit_id=$1",[snap.visit.id])).rows[0].n,1);
 assert.equal((await fixture.db.query<{n:number}>("select count(*)::int n from events where visit_id=$1 and event_type='product_compared'",[snap.visit.id])).rows[0].n,0);
 await noCompare.close();pass("比較を使わない来店も購入画面から完了し、比較記録や離脱を作らない");
 await writeFile(resolve(output,"result.json"),JSON.stringify({passed},null,2));
}catch(error){console.error(await activePage?.locator("body").innerText());await writeFile(resolve(output,"server.log"),log);throw error;}finally{await browser?.close();server.kill();await fixture.close();}
