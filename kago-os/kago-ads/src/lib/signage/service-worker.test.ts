import {describe,it,expect,vi} from "vitest";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const origin="https://signage.example.test";
function setup(){
 const handlers:Record<string,(event:unknown)=>void>={};
 const names=new Set(["kago-signage-v1","kago-signage-shell-old","kago-signage-media-v1","unrelated-cache"]);
 const cache={add:vi.fn(async(url:string)=>{void url;}),put:vi.fn(async()=>undefined),match:vi.fn(async()=>new Response("cached"))};
 const storage={keys:async()=>[...names],delete:vi.fn(async(name:string)=>names.delete(name)),open:async()=>cache};
 const fetcher=vi.fn(async()=>new Response("network"));
 vm.runInNewContext(readFileSync(new URL("../../../public/signage/sw.js",import.meta.url),"utf8"),{
  self:{location:{origin},skipWaiting:()=>undefined,clients:{claim:async()=>undefined},addEventListener:(name:string,handler:(event:unknown)=>void)=>{handlers[name]=handler;}},
  caches:storage,fetch:fetcher,URL,Response,
 });
 return {handlers,names,cache,storage,fetcher};
}
describe("SIG-03 Service Workerの保存範囲",()=>{
 it("更新時は古いシェルだけを消し、素材と他サービスのキャッシュを保持する",async()=>{
  const s=setup();let work:Promise<unknown>|undefined;s.handlers.activate({waitUntil:(p:Promise<unknown>)=>{work=p;}});
  await work;expect([...s.names].sort()).toEqual(["kago-signage-media-v1","unrelated-cache"]);
 });
 it("事前保存は自サービスの画面・JS/CSSだけ。壊れたURL・API・通常Ads・他originは無視する",async()=>{
  const s=setup();let work:Promise<unknown>|undefined;
  s.handlers.message({data:{type:"precache",urls:[origin+"/signage/play?device=D1",origin+"/ads-static/_next/static/main.js",origin+"/ads",origin+"/api/account","not a URL",null,"https://other.example.test/_next/static/x.js"]},waitUntil:(p:Promise<unknown>)=>{work=p;}});
  await work;expect(s.cache.add.mock.calls.map(c=>c[0])).toEqual([origin+"/signage/play?device=D1",origin+"/ads-static/_next/static/main.js"]);
 });
 it("現在と旧形式のJS/CSSは通信失敗時に保存済みファイルを返す",async()=>{
  for(const path of ["/ads-static/_next/static/main.js","/_next/static/main.css"]){
   const s=setup();s.fetcher.mockRejectedValue(new Error("offline"));let response:Promise<Response>|undefined;
   s.handlers.fetch({request:{url:origin+path,method:"GET",headers:new Headers(),mode:"cors"},respondWith:(p:Promise<Response>)=>{response=p;}});
   expect(await(await response!).text()).toBe("cached");
  }
 });
 it("API・通常Ads・他origin・Range・POSTを横取りしない",()=>{
  for(const [url,method,range]of [[origin+"/api/account","GET",false],[origin+"/ads","GET",false],["https://other.example.test/ad-assets/a.png","GET",false],[origin+"/ad-assets/a.mp4","GET",true],[origin+"/signage/play","POST",false]] as const){
   const s=setup(),respondWith=vi.fn();
   s.handlers.fetch({request:{url,method,mode:"navigate",headers:new Headers(range?{range:"bytes=0-1"}:{})},respondWith});
   expect(respondWith).not.toHaveBeenCalled();
  }
 });
 it("保存容量の不足で正常なネットワーク応答を捨てない",async()=>{
  const s=setup();s.cache.put.mockRejectedValue(new Error("quota"));let response:Promise<Response>|undefined;
  s.handlers.fetch({request:{url:origin+"/ads-static/_next/static/main.js",method:"GET",headers:new Headers(),mode:"cors"},respondWith:(p:Promise<Response>)=>{response=p;}});
  expect(await(await response!).text()).toBe("network");
 });
 it("公開素材は保存済みでも同じURLの新しい応答を取得して保存する",async()=>{
  const s=setup();s.cache.match.mockResolvedValue(new Response("old-image"));
  s.fetcher.mockResolvedValue(new Response("updated-image"));
  const request={url:origin+"/ad-assets/replaced.png",method:"GET",headers:new Headers(),mode:"cors"};
  let response:Promise<Response>|undefined;
  s.handlers.fetch({request,respondWith:(p:Promise<Response>)=>{response=p;}});
  expect(await(await response!).text()).toBe("updated-image");
  expect(s.fetcher).toHaveBeenCalledWith(request);expect(s.cache.put).toHaveBeenCalled();
 });
 it("公開素材は通信失敗時に保存済みの最新版へ戻る",async()=>{
  const s=setup();s.cache.match.mockResolvedValue(new Response("latest-saved-image"));
  s.fetcher.mockRejectedValue(new Error("offline"));
  const request={url:origin+"/ad-assets/replaced.png",method:"GET",headers:new Headers(),mode:"cors"};
  let response:Promise<Response>|undefined;
  s.handlers.fetch({request,respondWith:(p:Promise<Response>)=>{response=p;}});
  expect(await(await response!).text()).toBe("latest-saved-image");expect(s.fetcher).toHaveBeenCalledWith(request);
 });

});
