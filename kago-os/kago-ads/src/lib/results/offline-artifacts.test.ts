import {it,expect} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {readFile,readdir,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import snapshot from "../../../../shared/demo/results-fixed.json";
import {PlacementCard,Legend} from "../../features/results/maker-results";
import {summarizeApp,summarizeSignage,type MakerResults} from "./results";
import {MetricsScreen} from "../../../../kago-insight/src/features/metrics/metrics-screen";
import type {AppMetricRow,SignageMetricRow,OrderTotals,SelectionCount} from "../../../../kago-insight/src/lib/types";

const repo=fileURLToPath(new URL("../../../../../",import.meta.url));
const inputs=[
 "kago-os/shared/demo/results-fixed.json","kago-os/shared/demo/results-offline-sw.js",
 "kago-os/kago-ads/src/lib/results/offline-artifacts.test.ts",
 "kago-os/kago-ads/src/features/results/maker-results.tsx",
 "kago-os/kago-ads/src/components/parts.tsx","kago-os/kago-ads/src/components/badges.tsx",
 "kago-os/kago-ads/src/lib/results/results.ts","kago-os/kago-ads/src/lib/domain/rules.ts",
 "kago-os/kago-ads/src/app/globals.css",
 "kago-os/kago-insight/src/features/metrics/metrics-screen.tsx",
 "kago-os/kago-insight/src/lib/labels.ts","kago-os/kago-insight/src/lib/format.ts",
 "kago-os/kago-insight/src/components/state.tsx","kago-os/kago-insight/src/app/globals.css",
];
const digest=(s:string|Buffer)=>createHash("sha256").update((typeof s==="string"?s:s.toString("utf8")).replace(/\r\n/g,"\n")).digest("hex");
const hosts=["ads","insight"] as const;
const artifact=(host:typeof hosts[number])=>path.join(repo,"kago-os/kago-"+host,"public",host==="ads"?"ads/fixed-results":"fixed-results");
async function cssFiles(dir:string):Promise<string[]>{
 const all=await readdir(dir,{withFileTypes:true});
 return (await Promise.all(all.map(e=>e.isDirectory()?cssFiles(path.join(dir,e.name)):Promise.resolve(e.name.endsWith(".css")?[path.join(dir,e.name)]:[])))).flat().sort();
}
function boot(){
 const views=["ads","insight"],host=document.body.dataset.host!;
 function show(){const active=location.hash==="#insight"?"insight":location.hash==="#ads"?"ads":host;for(const id of views){document.getElementById(id)!.hidden=id!==active;document.getElementById("tab-"+id)!.setAttribute("aria-current",id===active?"page":"false");}}
 addEventListener("hashchange",show);show();
 const status=document.getElementById("offline-ready")!;
 if(location.protocol==="file:"){document.getElementById("save-file")!.hidden=true;status.textContent="保存したファイルで表示中（DBには接続していません）";return;}
 const ownPrefix=location.pathname.split("/fixed-results/")[0];
 document.getElementById(host+"-live")!.setAttribute("href",ownPrefix+(host==="ads"?"/maker/results":"/metrics"));
 document.getElementById("save-file")!.addEventListener("click",event=>{
  event.preventDefault();
  const copy=document.documentElement.cloneNode(true) as HTMLElement;
  for(const id of views){const live=document.getElementById(id+"-live") as HTMLAnchorElement;copy.querySelector("#"+id+"-live")!.setAttribute("href",live.href);}
  const url=URL.createObjectURL(new Blob(["<!doctype html>"+copy.outerHTML],{type:"text/html;charset=utf-8"}));
  const link=document.createElement("a");link.href=url;link.download="kago-fixed-results.html";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 if("serviceWorker" in navigator){
  const done=()=>{status.textContent=(!document.body.dataset.offline&&navigator.onLine)?"オフライン表示の準備完了":"保存済みの固定データで表示中（オフライン）";};
  addEventListener("offline",()=>{if(navigator.serviceWorker.controller)done();});
  addEventListener("online",()=>{if(navigator.serviceWorker.controller)done();});
  if((document.body.dataset.offline||!navigator.onLine)&&navigator.serviceWorker.controller){done();return;}
  navigator.serviceWorker.register("./sw.js").then(()=>navigator.serviceWorker.ready).then(()=>{
   if(navigator.serviceWorker.controller)done();else navigator.serviceWorker.addEventListener("controllerchange",done,{once:true});
  }).catch(()=>{if(navigator.serviceWorker.controller)done();else status.textContent="オフライン保存に失敗しました。通信中に再読込するか、この画面をファイルに保存してください。";});
 }
}

it("DATA-04: 共通の架空スナップショットと静的成果画面を生成・検査",async()=>{
 const inputHashes=Object.fromEntries(await Promise.all(inputs.map(async p=>[p,digest(await readFile(path.join(repo,p)))])));
 if(process.env.KAGO_GENERATE_OFFLINE_RESULTS==="1"){
  let css="";
  for(const host of hosts){
   const files=await cssFiles(path.join(repo,"kago-os/kago-"+host,".next/static"));
   expect(files.length).toBeGreaterThan(0);
   for(const f of files)css+=await readFile(f,"utf8");
  }
  expect(css).not.toMatch(/url\(/i);
  const maker:MakerResults={placements:snapshot.maker.placements as MakerResults["placements"],
   app:snapshot.app.filter(r=>r.ad_placement_id==="PL1") as MakerResults["app"],
   signage:snapshot.signage.filter(r=>r.ad_placement_id==="PL1") as MakerResults["signage"]};
  const ads=renderToStaticMarkup(createElement(Legend))+maker.placements.map(p=>renderToStaticMarkup(createElement(PlacementCard,{placement:p,app:summarizeApp(p,maker.app),signage:summarizeSignage(p,maker.signage)}))).join("");
  const insight=renderToStaticMarkup(createElement(MetricsScreen,{
   appRows:snapshot.app as AppMetricRow[],signageRows:snapshot.signage as SignageMetricRow[],
   orderTotals:snapshot.orders as OrderTotals[],selectionCounts:snapshot.selections as SelectionCount[],
   subjectNames:snapshot.subjectNames,readOnly:true}));
  const version=digest(JSON.stringify(inputHashes)+css+ads+insight).slice(0,16);
  const date=new Intl.DateTimeFormat("ja-JP",{dateStyle:"long",timeStyle:"short",timeZone:"Asia/Tokyo"}).format(new Date(snapshot.as_of));
  for(const host of hosts){
   const dir=artifact(host);await mkdir(dir,{recursive:true});
   const html=[
    '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>KAGO 固定の成果画面</title><style>',css,
    '.banner h1{font-size:1.25rem;font-weight:800;line-height:1.35;margin:0 0 8px}.banner p{font-size:.875rem;line-height:1.6;margin:6px 0}.banner #offline-ready{font-weight:700}.frame>main>h2{font-size:1.25rem;line-height:1.4;font-weight:700}.frame>main>a{display:inline-block;color:#007e88;font-size:.875rem;text-decoration:underline}body{margin:0;background:#f5f8fa;color:#10233f;font-family:Arial,sans-serif}.frame{max-width:1200px;margin:auto;padding:20px;min-width:0}.banner{padding:16px;border:2px solid #a16207;border-radius:12px;background:#fffbeb;margin-bottom:20px}.offline-nav{display:flex;flex-wrap:wrap;gap:12px;margin:14px 0}.offline-nav a{padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;background:white;color:#10233f;text-decoration:underline}.offline-nav a[aria-current=page]{font-weight:bold;border-color:#007e88}[hidden]{display:none!important}main>*+*{margin-top:16px}table{max-width:100%}',
    '</style></head><body data-host="'+host+'"><div class="frame"><header class="banner"><h1>説明用の固定データ（架空）</h1><p>データの時点（架空）：',date,'（日本時間）</p><p>これは実DBの現在値ではありません。共通仕様の例を使った模擬の集計です。DBへの書込みは行いません。</p><p id="offline-ready" role="status">オフライン表示を準備しています</p><nav class="offline-nav" aria-label="固定成果の表示"><a id="tab-ads" href="#ads">Adsの固定成果</a><a id="tab-insight" href="#insight">Insightの固定成果</a><a id="save-file" href="./index.html" download="kago-fixed-results.html">この画面をファイルに保存</a></nav></header>',
    '<main id="ads"'+(host==="ads"?"":" hidden")+'><h2>Ads：架空メーカーの成果</h2><a id="ads-live" href="/ads/maker/results">Adsの実DB表示へ戻る</a>',ads,'</main>',
    '<main id="insight" class="insight-main"'+(host==="insight"?"":" hidden")+'><h2>Insight：架空店舗の成果</h2><a id="insight-live" href="/insight/metrics">Insightの実DB表示へ戻る</a>',insight,'</main>',
    '<footer class="mt-6 text-sm">','通常表示へ戻すには通信を復旧してください。固定値はDBの実績へ反映されません。</footer></div><script>(',boot.toString(),')()</script></body></html>',
   ].join("");
   const cache="kago-data04-"+host+"-"+version;
   const worker="const CACHE="+JSON.stringify(cache)+",PREFIX="+JSON.stringify("kago-data04-"+host+"-")+";\n"+await readFile(path.join(repo,"kago-os/shared/demo/results-offline-sw.js"),"utf8");
   await writeFile(path.join(dir,"index.html"),html);await writeFile(path.join(dir,"sw.js"),worker);
   await writeFile(path.join(dir,"manifest.json"),JSON.stringify({schema_version:1,version,as_of:snapshot.as_of,inputs:inputHashes,html_sha256:digest(html),sw_sha256:digest(worker)},null,2)+"\n");
  }
 }
 for(const host of hosts){
  const dir=artifact(host),manifest=JSON.parse(await readFile(path.join(dir,"manifest.json"),"utf8"));
  expect(manifest.inputs).toEqual(inputHashes);
  const html=await readFile(path.join(dir,"index.html"),"utf8"),worker=await readFile(path.join(dir,"sw.js"),"utf8");
  expect(digest(html)).toBe(manifest.html_sha256);expect(digest(worker)).toBe(manifest.sw_sha256);
  expect(html).toContain("説明用の固定データ（架空）");expect(html).toContain("2026年10月25日");expect(html).toContain("18:00");
  expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=|<img[^>]+src=/i);
 }
},30000);
