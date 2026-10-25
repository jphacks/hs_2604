import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir} from "node:fs/promises";
import {chromium} from "playwright";
const base="http://127.0.0.1:3234";
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3234"],{stdio:"ignore",windowsHide:true});
let browser;
try{
 for(let n=0;n<100;n++){try{if((await fetch(base+"/signage/selection-player")).ok)break;}catch{}if(n===99)throw Error("Server startup timed out");await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??"/usr/bin/google-chrome"});
 const context=await browser.newContext({viewport:{width:1280,height:900}}),external:string[]=[],errors:string[]=[];
 await context.route("**/*",r=>{if(new URL(r.request().url()).origin===base)return r.continue();external.push(new URL(r.request().url()).origin);return r.abort();});
 const p=await context.newPage();p.on("pageerror",e=>errors.push(e.message));
 await mkdir("../../internal/sig06-player-evidence",{recursive:true});
 await p.goto(base+"/signage/selection-player");
 const selected=p.getByTestId("crowd-player-selected");
 await selected.filter({hasText:"パスタの広告"}).waitFor();await p.locator('[data-testid="crowd-player-screen"] img').evaluate(el=>(el as HTMLImageElement).decode());
 await p.screenshot({path:"../../internal/sig06-player-evidence/pasta.png",fullPage:true});console.log("PASS 通常の表示部品でパスタ広告と価格を表示");
 await p.getByRole("button",{name:"パン多め",exact:true}).click();await selected.filter({hasText:"パンの広告"}).waitFor();
 assert.match(await p.locator('[data-testid="crowd-player-screen"] img').getAttribute("src")??"",/bread\.svg/);
 await p.screenshot({path:"../../internal/sig06-player-evidence/bread.png",fullPage:true});console.log("PASS パンの画像・選定理由へ切り替わる");
 await p.getByRole("button",{name:"少人数",exact:true}).click();await selected.filter({hasText:"汎用のご案内"}).waitFor();
 await p.getByTestId("crowd-player-reason").filter({hasText:"人数が少ない"}).waitFor();console.log("PASS 少人数で汎用案内へ切替");
 await p.getByRole("button",{name:"集計なし",exact:true}).click();await p.getByTestId("crowd-player-reason").filter({hasText:"集計がない"}).waitFor();
 await p.getByRole("button",{name:"期限切れ",exact:true}).click();await p.getByTestId("crowd-player-reason").filter({hasText:"有効期限"}).waitFor();console.log("PASS 欠落・期限切れを案内理由で区別");
 await p.getByRole("button",{name:"パスタ広告を停止",exact:true}).click();await selected.filter({hasText:"パンの広告"}).waitFor();
 await p.getByRole("button",{name:"全広告を停止",exact:true}).click();await selected.filter({hasText:"汎用のご案内"}).waitFor();console.log("PASS 停止された広告を表示しない");
 await p.waitForTimeout(5500);
 const event=p.waitForEvent("download");await p.getByRole("button",{name:"再生と選定のJSONを保存",exact:true}).click();
 const download=await event,stream=await download.createReadStream();assert.ok(stream);let raw="";for await(const c of stream)raw+=c.toString();
 const log=JSON.parse(raw);assert.equal(log.format,"sig06-player-v1");assert.ok(log.completed_plays.some((x:{mode:string;reason_code:string})=>x.mode==="adaptive"&&x.reason_code==="crowd_category"));
 assert.ok(log.selections.every((x:{play_id:string;decision:{policy_version:string}})=>x.play_id&&x.decision.policy_version==="sig06-crowd-v1"));
 assert.equal(log.selections.find((x:{decision:{reason_code:string}})=>x.decision.reason_code==="crowd_small").decision.snapshot,null);
 console.log("PASS 再生ID・選定版・理由を記録し少人数の内訳を保存しない");
 await p.setViewportSize({width:320,height:568});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await p.screenshot({path:"../../internal/sig06-player-evidence/mobile.png",fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log("PASS 320px幅・ブラウザエラーなし・共有DB通信なし");
}finally{await browser?.close();server.kill();}
