import {it} from "vitest";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {mkdtemp,unlink,rmdir,mkdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {chromium} from "playwright";

it.skipIf(process.env.KAGO_DATA04_E2E!=="1")("DATA-04: Ads・Insightの完全通信断・再読込・ファイル保存・通常表示復帰",async()=>{
 const repo=fileURLToPath(new URL("../../../../../",import.meta.url));
 const browser=await chromium.launch({headless:true,executablePath:"/usr/bin/google-chrome"});
 const temp=await mkdtemp(path.join(tmpdir(),"kago-data04-"));let checks=0;
 try{
  for(const host of ["ads","insight"] as const){
   const socket=createServer();await new Promise<void>(r=>socket.listen(0,"127.0.0.1",r));const addr=socket.address();assert.ok(addr&&typeof addr!=="string");const port=addr.port;await new Promise<void>(r=>socket.close(()=>r()));
   const root=path.join(repo,"kago-os/kago-"+host);
   let server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{cwd:root,stdio:["ignore","pipe","ignore"]});
   const ctx=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
   let ready="";server.stdout!.on("data",v=>{ready+=String(v);});
   const downloaded=path.join(temp,host+".html");
   try{
    for(let n=0;!ready.includes("Ready in");n++){assert.equal(server.exitCode,null);assert.ok(n<100);await new Promise(r=>setTimeout(r,200));}
    const base="http://127.0.0.1:"+port,entry=host==="ads"?"/ads/fixed-results/index.html":"/fixed-results/index.html";
    const requests:{url:string;method:string}[]=[];ctx.on("request",r=>requests.push({url:r.url(),method:r.method()}));
    await ctx.addCookies([{name:"kago-"+host+"-auth",value:"PRIVATE_COOKIE_PROOF",url:base}]);
    const p=await ctx.newPage();p.setDefaultTimeout(15000);
    const response=await p.goto(base+entry);assert.ok(response?.ok());assert.ok(!(await response!.text()).includes("PRIVATE_COOKIE_PROOF"));
    await p.getByText("オフライン表示の準備完了",{exact:true}).waitFor();checks++;
    assert.ok(await p.evaluate(()=>!!navigator.serviceWorker.controller));
    const cached=await p.evaluate(async()=>{const urls:string[]=[];for(const name of await caches.keys()){for(const request of await(await caches.open(name)).keys())urls.push(new URL(request.url).pathname);}return urls;});
    assert.deepEqual(cached,[entry]);checks++;
    await new Promise<void>(resolve=>{server.once("exit",()=>resolve());server.kill();});
    await ctx.setOffline(true);const offlineResponse=await p.reload({waitUntil:"domcontentloaded"});assert.ok(offlineResponse?.fromServiceWorker());
    await p.getByRole("heading",{name:"説明用の固定データ（架空）",exact:true}).waitFor();
    await p.getByText("保存済みの固定データで表示中（オフライン）",{exact:true}).waitFor();checks++;
    await p.getByRole("link",{name:"Adsの固定成果",exact:true}).click();
    await p.locator("#ads").waitFor({state:"visible"});assert.ok(await p.locator("#ads").isVisible());
    assert.equal((await p.locator('#ads [data-testid="app-synthetic"] td').nth(1).textContent())?.trim(),"2");
    assert.equal((await p.locator('#ads [data-testid="signage-synthetic"] td').nth(1).textContent())?.trim(),"20");checks++;
    await p.getByRole("link",{name:"Insightの固定成果",exact:true}).click();
    await p.locator("#insight").waitFor({state:"visible"});assert.ok(await p.locator("#insight").isVisible());assert.ok((await p.locator("#insight").innerText()).includes("794"));
    assert.equal(await p.locator("#insight button").count(),0);checks++;
    await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks++;
    await p.reload({waitUntil:"domcontentloaded"});await p.locator("#insight").waitFor({state:"visible"});assert.ok(await p.locator("#insight").isVisible());checks++;
    const out=path.join(repo,"docs/development/screenshots");await mkdir(out,{recursive:true});
    if(host==="insight")await p.screenshot({path:path.join(out,"data04-insight-offline-390.png"),fullPage:true});
    await p.getByRole("link",{name:"Adsの固定成果",exact:true}).click();
    if(host==="ads")await p.screenshot({path:path.join(out,"data04-ads-offline-390.png"),fullPage:true});
    const downloadPromise=p.waitForEvent("download");await p.getByRole("link",{name:"この画面をファイルに保存",exact:true}).click();
    await(await downloadPromise).saveAs(downloaded);checks++;
    assert.equal(requests.filter(r=>/\/(rest|auth)\/v1\//.test(new URL(r.url).pathname)).length,0);
    assert.equal(requests.filter(r=>!["GET","HEAD","OPTIONS"].includes(r.method)).length,0);checks++;
    const local=await ctx.newPage();await local.goto(pathToFileURL(downloaded).href);
    await local.getByText("保存したファイルで表示中（DBには接続していません）",{exact:true}).waitFor();
    assert.ok(!(await local.locator("#save-file").isVisible()));
    assert.ok((await local.locator("#"+host+"-live").getAttribute("href"))?.startsWith(base));
    await local.getByRole("link",{name:"Insightの固定成果",exact:true}).click();await local.locator("#insight").waitFor({state:"visible"});assert.ok(await local.locator("#insight").isVisible());checks++;
    await local.close();
    ready="";server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{cwd:root,stdio:["ignore","pipe","ignore"]});server.stdout!.on("data",v=>{ready+=String(v);});
    for(let n=0;!ready.includes("Ready in");n++){assert.equal(server.exitCode,null);assert.ok(n<100);await new Promise(r=>setTimeout(r,200));}
    await ctx.setOffline(false);await p.getByRole("link",{name:host==="ads"?"Adsの固定成果":"Insightの固定成果",exact:true}).click();
    await p.locator("#"+host+"-live").click();
    await p.getByRole("heading",{name:host==="ads"?"メーカーとしてログイン":"ログイン",exact:true}).waitFor();checks++;
    assert.equal(requests.filter(r=>!["GET","HEAD","OPTIONS"].includes(r.method)).length,0);checks++;
   }finally{await ctx.close();server.kill();await unlink(downloaded).catch(()=>undefined);}
  }
  console.log(JSON.stringify({result:"PASS",browserChecks:checks,apiWrites:0,network:"fully_offline",hosts:2}));
 }finally{await browser.close();await rmdir(temp);}
},120000);
