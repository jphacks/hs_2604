import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {writeFile,unlink} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {createServer} from "node:net";
import {chromium} from "playwright";
const socket=createServer();await new Promise<void>(r=>socket.listen(0,"127.0.0.1",r));
const address=socket.address();assert.ok(address&&typeof address!=="string");const port=address.port;await new Promise<void>(r=>socket.close(()=>r()));
const base="http://127.0.0.1:"+port,entry="/signage/play?device=D1&debug=1";
const proofName="sw-refresh-proof-"+randomUUID()+".txt",proofPath="/ad-assets/"+proofName;
const proof=new URL("../public/ad-assets/"+proofName,import.meta.url);await writeFile(proof,"first-version");
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{stdio:["ignore","pipe","ignore"]});
let output="";server.stdout.on("data",v=>{output+=String(v);});
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try{
 for(let n=0;!output.includes("Ready in");n++){assert.equal(server.exitCode,null);assert.ok(n<100);await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({headless:true,executablePath:"/usr/bin/google-chrome"});
 const ctx=await browser.newContext(),p=await ctx.newPage();p.setDefaultTimeout(15000);
 await p.goto(base+"/signage");
 await p.evaluate(async()=>{
  await(await caches.open("kago-signage-v1")).put("/old-shell",new Response("old"));
  await(await caches.open("kago-signage-media-v1")).put("/media-preserve-proof",new Response("keep"));
 });
 await p.goto(base+entry);await p.getByTestId("signage-debug").waitFor();
 await p.waitForFunction(()=>!!document.querySelector("img")?.complete&&document.querySelector("img")!.naturalWidth>0);
 await p.waitForFunction(async()=>{
  if(!navigator.serviceWorker.controller)return false;
  const assets=performance.getEntriesByType("resource").map(r=>r.name).filter(u=>new URL(u).pathname.startsWith("/ads-static/_next/static/"));
  if(!assets.some(u=>u.endsWith(".css"))||!assets.some(u=>u.endsWith(".js")))return false;
  const cache=await caches.open("kago-signage-shell-v2");return (await Promise.all(assets.map(u=>cache.match(u)))).every(Boolean);
 });
 assert.equal(await p.evaluate(async()=>await(await caches.open("kago-signage-media-v1")).match("/media-preserve-proof").then(r=>r?.text())),"keep");
 assert.equal(await p.evaluate(url=>fetch(url,{cache:"no-store"}).then(r=>r.text()),proofPath),"first-version");
 await writeFile(proof,"updated-version-2");
 assert.equal(await p.evaluate(url=>fetch(url,{cache:"no-store"}).then(r=>r.text()),proofPath),"updated-version-2");
 assert.equal(await p.evaluate(()=>caches.has("kago-signage-v1")),false);
 const keys=await p.evaluate(async()=>(await(await caches.open("kago-signage-shell-v2")).keys()).map(r=>new URL(r.url).pathname));
 assert.ok(keys.includes("/signage/play"));assert.ok(keys.some(p=>p.startsWith("/ads-static/_next/static/")&&p.endsWith(".css")));
 assert.ok(keys.every(p=>p==="/signage/play"||p.startsWith("/ads-static/_next/static/")||p.startsWith("/_next/static/")||p.startsWith("/ad-assets/")));
 await new Promise<void>(r=>{server.once("exit",()=>r());server.kill();});await ctx.setOffline(true);
 const response=await p.reload({waitUntil:"domcontentloaded"});assert.ok(response?.fromServiceWorker());
 await p.getByTestId("signage-debug").waitFor();await p.getByText("接続先：仮データ",{exact:true}).waitFor();
 await p.waitForFunction(()=>!!document.querySelector("img")?.complete&&document.querySelector("img")!.naturalWidth>0);
 assert.equal(await p.evaluate(async()=>await(await caches.open("kago-signage-media-v1")).match("/media-preserve-proof").then(r=>r?.text())),"keep");
 assert.equal(await p.evaluate(url=>fetch(url,{cache:"no-store"}).then(r=>r.text()),proofPath),"updated-version-2");
 console.log(JSON.stringify({result:"PASS",checks:11,prefixedShellAssets:true,serverStopped:true,sameUrlRefresh:true,mode:"mock_device_shell_only",sharedWrites:0}));
 await ctx.close();
}finally{await browser?.close();server.kill();await unlink(proof).catch(()=>{});}
