import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {chromium} from "playwright";
import {createHeadlessBackend,readBackendConfig,signInBackend,signOutBackend} from "@kago/backend";
import {createSupabaseResultsRepository} from "../src/lib/backend/results.ts";
import {requireMaker} from "../src/lib/backend/portal.ts";
import {addDays,dayStart,dayEnd,today} from "../src/lib/domain/rules.ts";
const root=new URL("../",import.meta.url).pathname,base="http://127.0.0.1:3198";
const accounts=[
 {label:"A",email:process.env.KAGO_ADS_CHECK_A_EMAIL??process.env.KAGO_ADS_CHECK_EMAIL,password:process.env.KAGO_ADS_CHECK_A_PASSWORD??process.env.KAGO_ADS_CHECK_PASSWORD},
 {label:"B",email:process.env.KAGO_ADS_CHECK_B_EMAIL,password:process.env.KAGO_ADS_CHECK_B_PASSWORD},
].filter(a=>a.email&&a.password);
let server:ReturnType<typeof spawn>|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined,stage="start";
const clients:ReturnType<typeof createHeadlessBackend>[]=[],counts:number[]=[];
let checks=0;
try{
 assert(accounts.length>0);
 server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3198"],{cwd:root,stdio:"ignore"});
 for(let n=0;n<100;n++){try{if((await fetch(base+"/ads")).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({executablePath:"/usr/bin/google-chrome",headless:true});
 for(const a of accounts){
  stage=a.label+":expected";
  const c=createHeadlessBackend(readBackendConfig({url:process.env.NEXT_PUBLIC_SUPABASE_URL,publishableKey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}));clients.push(c);
  await signInBackend(c,a.email!,a.password!,"maker_staff");
  const identity=await requireMaker(c);
  const data=await createSupabaseResultsRepository(c).listMakerResults({role:"maker_staff",makerId:identity.makerIds[0]},{start:dayStart(addDays(today(),-30)),end:dayEnd(today())});
  counts.push(data.placements.length);
  const ctx=await browser.newContext({viewport:{width:1280,height:900}}),p=await ctx.newPage();
  p.setDefaultTimeout(15000);
  stage=a.label+":login";
  await p.goto(base+"/ads/portal");
  await p.getByLabel("メールアドレス").fill(a.email!);await p.getByLabel("パスワード",{exact:true}).fill(a.password!);
  await p.getByRole("button",{name:"ログイン",exact:true}).click();
  await p.getByRole("heading",{name:"募集ポータル",exact:true}).waitFor();checks++;
  stage=a.label+":results_link";
  await p.getByRole("link",{name:"広告の成果",exact:true}).click();
  await p.getByRole("heading",{name:"広告の成果",exact:true}).waitFor();
  async function ready(){
   if(data.placements.length)await p.getByTestId("result-"+data.placements[0].id).waitFor();
   else await p.getByText("承認された広告はまだありません。店舗の募集に申請し、承認されると、ここに成果が出ます。",{exact:true}).waitFor();
   assert.equal(await p.locator('[data-testid^="result-"]').count(),data.placements.length);
  }
  await ready();checks++;
  stage=a.label+":reload";
  await p.reload();await ready();checks++;
  stage=a.label+":mobile";
  await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks++;
  stage=a.label+":logout";
  await p.getByRole("button",{name:"ログアウト",exact:true}).click();
  await p.goto(base+"/ads/maker/results");
  await p.getByRole("heading",{name:"メーカーとしてログイン",exact:true}).waitFor();
  assert.equal(await p.locator('[data-testid^="result-"]').count(),0);checks++;
  await ctx.close();
 }
 console.log(JSON.stringify({result:"PASS",accounts:accounts.length,browserChecks:checks,placements:counts,mode:"real_supabase_read_only"}));
}catch{console.error(JSON.stringify({result:"FAIL",stage}));process.exitCode=1;}
finally{await browser?.close();server?.kill();await Promise.all(clients.map(c=>signOutBackend(c).catch(()=>undefined)));}
