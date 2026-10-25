import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {readFile,mkdir} from "node:fs/promises";
import {chromium} from "playwright";
const base="http://127.0.0.1:3233";
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3233"],{stdio:"ignore",windowsHide:true});
let browser;const checks:string[]=[];
try{
 for(let n=0;n<100;n++){try{if((await fetch(base+"/assets-preview")).ok)break;}catch{}if(n===99)throw Error("Server startup timed out");await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH??"/usr/bin/google-chrome",headless:true});
 const page=await browser.newPage(),errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 const rows=JSON.parse(await readFile("src/data/demo/ad-assets.json","utf8"));
 await mkdir("../../internal/ads05-evidence",{recursive:true});
 for(const size of [{width:1280,height:900},{width:390,height:844},{width:320,height:568}]){
  await page.setViewportSize(size);await page.goto(base+"/assets-preview");
  await page.locator("img").evaluateAll(async imgs=>{await Promise.all(imgs.map(img=>(img as HTMLImageElement).decode()));});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  for(const row of rows){
   const card=page.locator('[data-asset="'+row.asset_id+'"]');const frame=card.locator("[data-preview]>div");
   const bounds=await frame.boundingBox();assert.ok(bounds);
   if(row.format==="png"){const image=card.locator("img");assert.deepEqual(await image.evaluate(el=>[(el as HTMLImageElement).naturalWidth,(el as HTMLImageElement).naturalHeight]),[Number(row.width),Number(row.height)]);}
   else{await card.locator("video").evaluate(async el=>{const v=el as HTMLVideoElement;if(v.readyState<1)await new Promise<void>((resolve,reject)=>{v.addEventListener("loadedmetadata",()=>resolve(),{once:true});v.addEventListener("error",()=>reject(Error("video failed")),{once:true});});});assert.ok(Math.abs(await card.locator("video").evaluate(el=>(el as HTMLVideoElement).duration)-10)<.15);}
   const outside=await frame.locator("span").evaluateAll(es=>es.some(e=>{const p=e.closest('[data-preview]')!.getBoundingClientRect(),r=e.getBoundingClientRect();return r.left<p.left-1||r.right>p.right+1||r.top<p.top-1||r.bottom>p.bottom+1;}));assert.equal(outside,false,row.asset_id+" overlays fit "+size.width);
  }
  assert.equal(await page.locator("[data-square-signage] img").evaluate(el=>getComputedStyle(el).objectFit),"contain");
  await page.locator('[data-asset="CR1-v2-app"]').screenshot({path:"../../internal/ads05-evidence/app-"+size.width+".png"});
  await page.locator("[data-square-signage]").screenshot({path:"../../internal/ads05-evidence/square-signage-"+size.width+".png"});
  checks.push(size.width+"px: 7素材・重ね表示・正方形のSignage表示");
 }
 assert.deepEqual(errors,[]);console.log(checks.map(s=>"PASS "+s).join("\n"));console.log("PASS browser errors: 0");
}finally{await browser?.close();server.kill();}
