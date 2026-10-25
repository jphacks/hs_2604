import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir} from "node:fs/promises";
import {chromium} from "playwright";
const base="http://127.0.0.1:3236";
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3236"],{stdio:"ignore",windowsHide:true});
let browser;const checks:string[]=[];
try{
 for(let n=0;n<100;n++){try{if((await fetch(base+"/ad-design")).ok)break;}catch{}if(n===99)throw Error("Server startup timed out");await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??"/usr/bin/google-chrome"});
 const context=await browser.newContext(),errors:string[]=[],external:string[]=[];
 await context.route("**/*",r=>{if(new URL(r.request().url()).origin===base)return r.continue();external.push(new URL(r.request().url()).origin);return r.abort();});
 const p=await context.newPage();p.on("pageerror",e=>errors.push(e.message));
 await mkdir("../../internal/ad-design-evidence",{recursive:true});
 for(const size of [{width:1280,height:900},{width:390,height:844},{width:320,height:568}]){
  await p.setViewportSize(size);await p.goto(base+"/ad-design");
  for(const channel of ["App / 正方形","Signage / 横長"]){
   await p.getByRole("button",{name:channel,exact:true}).click();
   const expected=channel.startsWith("App")?5:6;
   assert.equal(await p.locator("[data-design]").count(),expected);
   await p.locator("img").evaluateAll(async es=>{await Promise.all(es.map(el=>(el as HTMLImageElement).decode()));});
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   for(const card of await p.locator("[data-design]").all()){
    const id=await card.getAttribute("data-design");
    if(id?.startsWith("CR")){
     assert.equal(await card.locator("[data-ad-disclosure]").count(),1);
     assert.equal(await card.locator("[data-frame] span").count(),0,"Supplied text/price must not be covered or duplicated");
    }
    const overflow=await card.locator("[data-frame] span").evaluateAll(es=>es.some(el=>{const frame=el.closest("[data-frame]")!.getBoundingClientRect(),r=el.getBoundingClientRect();return r.left<frame.left-1||r.right>frame.right+1||r.top<frame.top-1||r.bottom>frame.bottom+1;}));
    assert.equal(overflow,false,"Overlay fits "+size.width+" "+await card.getAttribute("data-design"));
   }
   if(channel.startsWith("Signage"))assert.equal(await p.locator("[data-square-frame] img").evaluate(el=>getComputedStyle(el).objectFit),"contain");
   if(size.width===1280||size.width===320)await p.screenshot({path:"../../internal/ad-design-evidence/"+(channel.startsWith("App")?"app":"signage")+"-"+size.width+".png",fullPage:true});
  }
  checks.push(size.width+"px: 11素材・重ね表示・横はみ出しなし・正方形のSignage表示");
 }
 await p.setViewportSize({width:1280,height:900});
 await p.getByRole("button",{name:"App / 正方形",exact:true}).click();
 for(const [label,prefix] of [["瀬戸内トマト食品","CR1-"],["確認用メーカー","CR2-"]]){
  await p.getByRole("button",{name:label,exact:true}).click();assert.equal(await p.locator("[data-design]").count(),2);
  assert.ok((await p.locator("[data-design]").evaluateAll(es=>es.map(e=>e.getAttribute("data-design")))).every(id=>id?.startsWith(prefix)));
  await p.locator("[data-design]").first().screenshot({path:"../../internal/ad-design-evidence/"+prefix+"app.png"});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 checks.push("メーカー別に2案を表示・写真読込成功・外部通信なし・画面エラーなし");
 console.log(checks.map(c=>"PASS "+c).join("\n"));
}finally{await browser?.close();server.kill();}
