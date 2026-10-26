import assert from 'node:assert/strict';
import {spawn,type ChildProcess} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createHeadlessBackend,signInBackend,signOutBackend} from '@kago/backend';

assert.equal(process.env.KAGO_SHARED_BROWSER,'1','Shared-browser opt-in required');
assert.ok(process.env.KAGO_CONNECTION_FILE,'Private connection file required');
const raw=await readFile(process.env.KAGO_CONNECTION_FILE,'utf8');
const value=(s:string):string=>{s=s.trim();try{return JSON.parse(s);}catch{return s;}};
const settings=Object.fromEntries([...raw.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)].map(m=>[m[1],value(m[2])]));
function account(alias:string){
 let active=false,email='',password='';
 for(const line of raw.split(/\r?\n/)){
  if(line.startsWith('[')){active=new RegExp('^\\['+alias+'(?:/[^\\]]+)?\\]$').test(line);continue;}
  if(active&&line.startsWith('メール = '))email=value(line.slice('メール = '.length));
  if(active&&line.startsWith('パスワード = '))password=value(line.slice('パスワード = '.length));
 }
 assert.ok(email&&password,'Missing account '+alias);return {email,password};
}
const adsRoot=fileURLToPath(new URL('../',import.meta.url));
const insightRoot=fileURLToPath(new URL('../../kago-insight/',import.meta.url));
const env:NodeJS.ProcessEnv={...process.env,NEXT_PUBLIC_SUPABASE_URL:settings.NEXT_PUBLIC_SUPABASE_URL,
 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:settings.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 NEXT_PUBLIC_ADS_DATA_SOURCE:'supabase',NEXT_PUBLIC_INSIGHT_DATA_SOURCE:'supabase',
 NEXT_PUBLIC_SIGNAGE_CROWD_SELECTION:'1',NEXT_PUBLIC_INSIGHT_BASE_PATH:''};
delete env.KAGO_DEMO_STORE_EMAIL;delete env.KAGO_DEMO_STORE_PASSWORD;
const base='http://127.0.0.1:3291',insight='http://127.0.0.1:3292';
const servers:ChildProcess[]=[],checks:string[]=[],playIds:string[]=[];
const config={url:settings.NEXT_PUBLIC_SUPABASE_URL,publishableKey:settings.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY};
const device=createHeadlessBackend(config),store=createHeadlessBackend(config);
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
function check(label:string){checks.push(label);console.log('PASS '+label);}
async function build(root:string){
 await new Promise<void>((resolve,reject)=>{
  const p=spawn(process.execPath,[root+'node_modules/next/dist/bin/next','build','--webpack'],{cwd:root,env,stdio:'ignore'});
  p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error('Build failed')));
 });
}
async function serve(root:string,port:string,path:string){
 const p=spawn(process.execPath,[root+'node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',port],{cwd:root,env,stdio:'ignore'});servers.push(p);
 for(let i=0;i<100;i++){
  if(p.exitCode!==null)throw new Error('Local server exited');
  try{if((await fetch('http://127.0.0.1:'+port+path)).ok)return;}catch{/* starting */}
  await new Promise(r=>setTimeout(r,300));
 }
 throw new Error('Local server timeout');
}
try{
 await signInBackend(device,account('DV1').email,account('DV1').password,'signage');
 await signInBackend(store,account('T1').email,account('T1').password,'store_staff');
 const crowd=await device.rpc('kago_signage_crowd');assert.ifError(crowd.error);
 assert.equal(crowd.data.sample_size,0,'Fallback-only test requires suppressed real crowd');
 assert.deepEqual(crowd.data.categories,[]);
 if(process.env.KAGO_E2E_SKIP_BUILD!=='1')await Promise.all([build(adsRoot),build(insightRoot)]);
 await Promise.all([serve(adsRoot,'3291','/signage/play'),serve(insightRoot,'3292','/login')]);
 check('production_servers_real_supabase_no_camera');
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/google-chrome',headless:true});
 const ctx=await browser.newContext({viewport:{width:1280,height:720},permissions:[]});
 await ctx.addInitScript(()=>{
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{throw new DOMException('Camera disabled','NotAllowedError');}});
 });
 const page=await ctx.newPage();
 await page.goto(base+'/signage/play?debug=1');
 await page.locator('input[name="email"]').fill(account('DV1').email);
 await page.locator('input[name="password"]').fill(account('DV1').password);
 await page.getByRole('button',{name:'ログインして表示を始める',exact:true}).click();
 const debug=page.getByTestId('signage-debug');
 await debug.filter({hasText:'crowd_small'}).waitFor({timeout:45000});
 assert.match(await debug.textContent()??'',/表示中：案内/);
 const session=await page.evaluate(()=>JSON.parse(localStorage.getItem('kago-signage-session-v1:db')??'null'));
 assert.equal(session.storeId,crowd.data.store_id);
 check('real_device_login_suppressed_fallback');
 const first=await page.evaluate(()=>JSON.parse(localStorage.getItem('kago-signage-outbox-v1:db')??'[]') as {id:string}[]);
 assert.equal(first.length,1);playIds.push(first[0].id);
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await page.reload();await debug.filter({hasText:'crowd_small'}).waitFor({timeout:45000});
 const outbox=async()=>page.evaluate(()=>JSON.parse(localStorage.getItem('kago-signage-outbox-v1:db')??'[]') as {id:string;ended_at:string|null}[]);
 const prior=await store.from('signage_decisions').select('play_id').eq('play_id',playIds[0]);
 assert.ifError(prior.error);assert.equal(prior.data?.length,1);assert.equal(prior.data![0].play_id,playIds[0]);
 check('real_player_completed_and_saved_decision');
 await ctx.setOffline(true);
 await page.getByRole('button',{name:'通信を切る（確認用）',exact:true}).click();
 await debug.filter({hasText:'通信：切断'}).waitFor();
 await page.reload();await debug.filter({hasText:'crowd_small'}).waitFor({timeout:30000});
 assert.match(await debug.textContent()??'',/表示中：案内/);
 const pending=(await outbox()).filter(p=>p.ended_at);assert.ok(pending.length>=1);
 playIds.push(...pending.map(p=>p.id));
 check('actual_network_offline_reload_cached_shell_and_pending_records');
 await ctx.setOffline(false);
 await page.getByRole('button',{name:'通信を戻す',exact:true}).click();
 await debug.filter({hasText:'通信：OK'}).waitFor({timeout:45000});
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kago-signage-outbox-v1:db')??'[]').every((p:{ended_at:string|null})=>!p.ended_at),{},{timeout:45000});
 const saved=await store.from('signage_decisions').select('play_id,decision').in('play_id',[...new Set(playIds)]);
 assert.ifError(saved.error);assert.equal(saved.data?.length,new Set(playIds).size);
 for(const row of saved.data??[]){assert.equal(row.decision.snapshot,null);assert.deepEqual(row.decision.weights,[]);assert.equal(row.decision.reason_code,'crowd_small');}
 check('reconnect_pending_decisions_once_without_small_crowd_details');
 const staff=await browser.newContext(),staffPage=await staff.newPage();
 await staffPage.goto(insight+'/signage-decisions');
 await staffPage.locator('input[name="email"]').fill(account('T1').email);await staffPage.locator('input[name="password"]').fill(account('T1').password);
 await staffPage.getByRole('button',{name:'ログイン',exact:true}).click();
 await staffPage.getByRole('heading',{name:'サイネージの選定理由',exact:true}).waitFor({timeout:45000});
 const own=staffPage.getByTestId('signage-decision').filter({hasText:playIds[0]});await own.waitFor();
 assert.match(await own.textContent()??'',/汎用の買い物案内/);assert.match(await own.textContent()??'',/集計の内訳は保持していません/);
 check('insight_real_store_displays_reason_and_privacy_notice');
 const foreign=await browser.newContext(),foreignPage=await foreign.newPage();
 await foreignPage.goto(insight+'/signage-decisions');
 await foreignPage.locator('input[name="email"]').fill(account('T2').email);await foreignPage.locator('input[name="password"]').fill(account('T2').password);
 await foreignPage.getByRole('button',{name:'ログイン',exact:true}).click();
 await foreignPage.getByRole('heading',{name:'サイネージの選定理由',exact:true}).waitFor({timeout:45000});
 assert.equal(await foreignPage.getByTestId('signage-decision').filter({hasText:playIds[0]}).count(),0);
 check('insight_other_store_does_not_render_history');
 await page.getByRole('button',{name:'端末からログアウト',exact:true}).click();
 await page.getByRole('heading',{name:'端末のログイン',exact:true}).waitFor();
 await page.reload();await page.getByRole('heading',{name:'端末のログイン',exact:true}).waitFor();
 assert.equal(await page.getByTestId('signage-debug').count(),0);
 check('device_logout_reload_denied');
 await Promise.all([ctx.close(),staff.close(),foreign.close()]);
 await writeFile(process.env.KAGO_SHARED_BROWSER_REPORT??'/tmp/kago241-browser.json',JSON.stringify({status:'PASS',checks,play_ids:[...new Set(playIds)],note:'Actual software fallback operation; no camera or participant measurement'},null,2),{mode:0o600});
}catch(error){
 let message=error instanceof Error?(error.stack??error.message):String(error);
 const secrets=[...Object.values(settings),...[...raw.matchAll(/^(?:メール|パスワード) = (.+)$/gm)].map(m=>value(m[1]))].filter(v=>v.length>=6);
 for(const secret of secrets)message=message.split(secret).join('[redacted]');
 console.error(message.replace(/https?:\/\/\S+/g,'[URL]').replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+/g,'[token]'));
 process.exitCode=1;
}finally{
 await browser?.close();
 await Promise.all([signOutBackend(device).catch(()=>{}),signOutBackend(store).catch(()=>{})]);
 for(const p of servers)if(p.exitCode===null)p.kill();
}
