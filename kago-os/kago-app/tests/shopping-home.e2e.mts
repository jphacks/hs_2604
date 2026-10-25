import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir} from "node:fs/promises";
import {setTimeout as delay} from "node:timers/promises";
import {chromium} from "playwright";
import {createCartBackend} from "./fixtures/cart-backend.mts";
const fixture=await createCartBackend(),base="http://127.0.0.1:3116";
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port","3116"],{env:{...process.env,KAGO_NEXT_DIST_DIR:".next/demo10-ui-check",KAGO_DEMO_ENABLED:"0",NEXT_PUBLIC_SUPABASE_URL:fixture.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test"},stdio:["ignore","pipe","pipe"]});
let log="",browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;server.stdout.on("data",c=>log=(log+c).slice(-4000));server.stderr.on("data",c=>log=(log+c).slice(-4000));
const passed:string[]=[];
try{
 for(let i=0;i<90;i++){if(server.exitCode!==null)throw Error(log);try{if((await fetch(base+"/api/shopping")).status===401)break;}catch{}if(i===89)throw Error(log);await delay(500);}
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH??"/usr/bin/google-chrome",headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors:string[]=[];
 page.on("pageerror",e=>errors.push(e.message));page.setDefaultTimeout(45000);
 await page.goto(base+"/App");await page.getByLabel("メールアドレス").fill("user3@example.test");await page.getByLabel("パスワード",{exact:true}).fill("fixture-password");
 await page.getByRole("button",{name:"ログイン",exact:true}).click();await page.getByRole("button",{name:"続きから開く",exact:true}).first().click();
 await page.getByTestId("shopping-home").waitFor();
 await page.getByRole("button",{name:"検索",exact:true}).waitFor();
 await page.getByRole("navigation",{name:"買い物ナビ"}).waitFor();
 assert.equal(await page.getByRole("button",{name:/買い物かごを開く/}).count(),0);
 assert.match(await page.locator(".shopping-store").innerText(),/検証1号店/);
 passed.push("右上に店名を表示し、商品ゼロではかごバナーを出さない");
 async function fits(){
  const layout=await page.evaluate(()=>{
   const selectors=[".shopping-header",".shopping-scanner",".shopping-search",".shopping-categories",".shopping-fresh",".shopping-nav"];
   const boxes=selectors.map(selector=>{const r=document.querySelector(selector)!.getBoundingClientRect();return {selector,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};});
   const banner=document.querySelector(".shopping-cart-summary");if(banner){const r=banner.getBoundingClientRect();boxes.push({selector:"basket",x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height});}
   const cta=document.querySelector(".shopping-fresh button")!.getBoundingClientRect(),fresh=document.querySelector(".shopping-fresh")!.getBoundingClientRect();
   return {width:innerWidth,height:innerHeight,scrollH:document.documentElement.scrollHeight,scrollW:document.documentElement.scrollWidth,boxes,ctaBottom:cta.bottom,freshBottom:fresh.bottom};
  });
  assert(layout.scrollH<=layout.height+1,JSON.stringify(layout));
  assert(layout.scrollW<=layout.width+1,JSON.stringify(layout));
  for(const r of layout.boxes){assert(r.height>0&&r.width>0&&r.x>=-1&&r.y>=-1&&r.right<=layout.width+1&&r.bottom<=layout.height+1,JSON.stringify(layout));}
  assert(layout.ctaBottom<=layout.freshBottom+1,JSON.stringify(layout));
  const before=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,650);assert.equal(await page.evaluate(()=>scrollY),before);
 }
 for(const [width,height] of [[390,844],[375,667],[320,568],[430,932],[1280,900]]){await page.setViewportSize({width,height});await fits();}
 passed.push("5サイズで全項目とバナーの操作を画面内に収め、ホームはスクロールしない");
 const images=new URL("../../../docs/images/",import.meta.url);await mkdir(images,{recursive:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:new URL("demo10-v2-empty.png",images).pathname,animations:"disabled"});
 await page.getByRole("button",{name:"果物から探す",exact:true}).click();
 const products=page.getByRole("dialog");
 await products.getByRole("button",{name:"検証りんごをかごに追加",exact:true}).waitFor();
 assert.equal(await products.getByRole("button",{name:"検証ミルクをかごに追加",exact:true}).count(),0);
 await products.getByRole("button",{name:"すべての商品",exact:true}).click();
 await products.getByRole("button",{name:"検証ミルクをかごに追加",exact:true}).waitFor();
 await products.getByLabel("検索結果を絞り込む").fill("りんご");await products.getByRole("button",{name:"商品一覧を検索",exact:true}).click();
 await products.getByRole("button",{name:"検証りんごをかごに追加",exact:true}).waitFor();
 assert.equal(await products.getByRole("button",{name:"検証ミルクをかごに追加",exact:true}).count(),0);
 passed.push("カテゴリと検索結果はタップ先で表示し、実際の商品を絞り込む");
 await products.getByRole("button",{name:"検証りんごをかごに追加",exact:true}).click();
 await products.getByText("かごを保存しました。",{exact:true}).waitFor();
 await products.getByRole("button",{name:"閉じる",exact:true}).click();
 await page.getByRole("button",{name:/買い物かごを開く、現在1点/}).waitFor();
 assert.equal(await page.locator(".shopping-cart-summary .shopping-cart-count").count(),0);
 passed.push("商品追加後だけ、アイコンの数字なしで品数と合計のかごバナーを表示");
 for(const [width,height] of [[390,844],[375,667],[320,568],[430,932]]){await page.setViewportSize({width,height});await fits();}
 await page.setViewportSize({width:320,height:568});await page.screenshot({path:new URL("demo10-v2-small.png",images).pathname,animations:"disabled"});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:new URL("demo10-v2-mobile.png",images).pathname,animations:"disabled"});
 await page.getByRole("button",{name:/買い物かごを開く、現在1点/}).click();await page.getByRole("dialog",{name:"買い物かご",exact:true}).waitFor();
 await page.getByRole("button",{name:"閉じる",exact:true}).click();
 passed.push("かごバナーから既存のかごを開閉できる");
 await page.getByRole("button",{name:"おすすめ商品を見る",exact:true}).click();
 await page.getByRole("dialog",{name:"おすすめ商品",exact:true}).waitFor();
 await page.getByRole("heading",{name:"あなたへのおすすめ",exact:true}).waitFor();
 await page.getByRole("button",{name:"閉じる",exact:true}).click();
 assert.equal(await page.getByRole("dialog").count(),0);
 passed.push("おすすめもタップ先で表示し、閉じると固定ホームへ戻る");
 assert.equal(await page.getByRole("link",{name:"マイページ",exact:true}).getAttribute("href"),"/App/account");
 assert.deepEqual(errors,[]);passed.push("下部ナビ・ブラウザエラーを確認");
 for(const p of passed)console.log("PASS "+p);
 console.log(passed.length+" fixed-home browser checks passed");
 await context.close();
}catch(error){console.error(log.slice(-1500));throw error;}
finally{await browser?.close();server.kill();await fixture.close();}
