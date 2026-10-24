import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir} from "node:fs/promises";
import {setTimeout as delay} from "node:timers/promises";
import {chromium} from "playwright";
import {createCartBackend} from "./fixtures/cart-backend.mts";
const before=process.env.KAGO_UI_BEFORE==="1",fixture=await createCartBackend(),base="http://127.0.0.1:3116";
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port","3116"],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:fixture.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test"},stdio:["ignore","pipe","pipe"]});
let log="",browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;server.stdout.on("data",c=>log=(log+c).slice(-4000));server.stderr.on("data",c=>log=(log+c).slice(-4000));
try{
 for(let i=0;i<90;i++){if(server.exitCode!==null)throw Error(log);try{if((await fetch(base+"/api/shopping")).status===401)break;}catch{}if(i===89)throw Error(log);await delay(500);}
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH??"/usr/bin/google-chrome",headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors:string[]=[];
 page.on("pageerror",e=>errors.push(e.message));page.setDefaultTimeout(45000);
 await page.goto(base+"/App");await page.getByLabel("メールアドレス").fill("user3@example.test");await page.getByLabel("パスワード",{exact:true}).fill("fixture-password");
 await page.getByRole("button",{name:"ログイン",exact:true}).click();await page.getByRole("button",{name:"続きから開く",exact:true}).first().click();
 await page.getByRole("button",{name:"検証ミルクをかごに追加",exact:true}).waitFor();
 await page.getByText("かごを最新の状態にしました。",{exact:true}).waitFor();
 const images=new URL("../../../docs/images/",import.meta.url);await mkdir(images,{recursive:true});
 await page.screenshot({path:new URL(before?"demo10-home-before.png":"demo10-home-mobile.png",images).pathname,fullPage:before,animations:"disabled"});
 if(!before){
  await page.getByRole("navigation",{name:"買い物ナビ"}).waitFor();
  assert.equal(await page.getByRole("link",{name:"マイページ",exact:true}).getAttribute("href"),"/App/account");
  await page.getByRole("button",{name:"果物から探す",exact:true}).click();
  await page.getByRole("button",{name:"検証りんごをかごに追加",exact:true}).waitFor();
  assert.equal(await page.getByRole("button",{name:"検証ミルクをかごに追加",exact:true}).count(),0);
  await page.getByRole("button",{name:"すべての商品",exact:true}).click();
  await page.getByRole("button",{name:"検証ミルクをかごに追加",exact:true}).waitFor();
  await page.getByLabel("商品名・商品コードで検索").fill("りんご");await page.getByRole("button",{name:"検索",exact:true}).click();
  await page.getByRole("button",{name:"検証りんごをかごに追加",exact:true}).waitFor();
  assert.equal(await page.getByRole("button",{name:"検証ミルクをかごに追加",exact:true}).count(),0);
  await page.getByRole("button",{name:"検証りんごをかごに追加",exact:true}).click();await page.getByText("かごを保存しました。",{exact:true}).waitFor();
  await page.getByRole("button",{name:/買い物かごを開く、現在1点/}).click();await page.getByRole("dialog").waitFor();
  await page.getByRole("button",{name:"閉じる",exact:true}).click();
  for(const width of [320,390,430,1280]){
   await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:new URL("demo10-home-cart-badge.png",images).pathname,animations:"disabled"});
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:new URL("demo10-home-desktop.png",images).pathname,fullPage:true,animations:"disabled"});
  assert.deepEqual(errors,[]);console.log("PASS home, category, search, real cart add, existing cart dialog, cart count, navigation, four widths and browser errors");
 }
 console.log(before?"Before screenshot saved":"Shopping home UI checks passed");
 await context.close();
}finally{await browser?.close();server.kill();await fixture.close();}
