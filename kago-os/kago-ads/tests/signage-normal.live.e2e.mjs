import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createHeadlessBackend,getBackendIdentity,signInBackend,signOutBackend} from '@kago/backend';
import {createSupabaseMakerRepository} from '../src/lib/backend/maker.ts';
import {createSupabaseStoreCallsRepository} from '../src/lib/backend/store-calls.ts';

assert.equal(process.env.KAGO_SIG_NORMAL_LIVE,'1','Explicit normal-signage opt-in required');
assert.ok(process.env.KAGO_CONNECTION_FILE,'Private connection file required');
const text=await readFile(process.env.KAGO_CONNECTION_FILE,'utf8');
const value=s=>{try{return JSON.parse(s.trim());}catch{return s.trim();}};
const settings=Object.fromEntries([...text.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)].map(m=>[m[1],value(m[2])]));
function credential(alias){let active=false,email='',password='';for(const line of text.split(/\r?\n/)){
 if(line.startsWith('[')){active=new RegExp('^\\['+alias+'(?:/[^\\]]+)?\\]$').test(line);continue;}
 if(active&&line.startsWith('メール = '))email=value(line.slice('メール = '.length));
 if(active&&line.startsWith('パスワード = '))password=value(line.slice('パスワード = '.length));
}assert.ok(email&&password,'Missing account '+alias);return {email,password};}
const root=fileURLToPath(new URL('../',import.meta.url)),base='http://127.0.0.1:3295';
const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:settings.NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:settings.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,NEXT_PUBLIC_ADS_DATA_SOURCE:'supabase',NEXT_PUBLIC_SIGNAGE_CROWD_SELECTION:'0'};
const config={url:env.NEXT_PUBLIC_SUPABASE_URL,publishableKey:env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY};
const clients=[],calls=[],applications=[],report={status:'running',checks:[],ids:{}};
const output=process.env.KAGO_SIG_NORMAL_REPORT??'/tmp/kago-sig-normal.json';
let server,browser,session;
async function persist(){await writeFile(output,JSON.stringify(report,null,2),{mode:0o600});}
async function pass(label){report.checks.push(label);await persist();console.log('PASS '+label);}
async function poll(fn){for(let i=0;i<200;i++){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,400));}throw Error('Condition timed out');}
async function login(alias){const c=createHeadlessBackend(config);clients.push(c);const a=credential(alias);await signInBackend(c,a.email,a.password);return c;}
const maker=await login('M2'),store=await login('T1'),device=await login('DV1');
const makerRepo=createSupabaseMakerRepository(maker),storeRepo=createSupabaseStoreCallsRepository(store);
try{
 const identity=await getBackendIdentity(device,'signage');assert.ok(identity.device);session=identity.device;
 const makerId=(await maker.from('maker_members').select('maker_id').eq('user_id',(await getBackendIdentity(maker)).userId).single()).data.maker_id;
 const makerSession={role:'maker_staff',makerId},storeSession={role:'store_staff',storeId:session.storeId};
 const product=(await store.from('products').select('id,category').eq('code','2900000000056').single()).data;
 if(process.env.KAGO_SIG_SKIP_BUILD!=='1')await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[root+'node_modules/next/dist/bin/next','build','--webpack'],{cwd:root,env,stdio:'ignore'});p.on('exit',code=>code===0?resolve():reject(Error('Build failed')));p.on('error',reject);});
 server=spawn(process.execPath,[root+'node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3295'],{cwd:root,env,stdio:'ignore'});
 await poll(async()=>{if(server.exitCode!==null)throw Error('Server exited');try{return(await fetch(base+'/signage/play')).ok;}catch{return false;}});
 const begins=new Date(Date.now()-60000).toISOString(),endsA=new Date(Date.now()+600000).toISOString(),endsB=new Date(Date.now()+65000).toISOString();
 async function prepare(letter,end,file){
  const title='SIG01-03 '+letter+' '+new Date().toISOString();
  let call=await storeRepo.saveAdCall(storeSession,{title,description:'SIG01-03 isolated test',categories:[product.category],channels:['signage'],starts_at:begins,ends_at:end,disclosure_scope:['impressions']});calls.push(call.id);await persist();call=await storeRepo.setAdCallStatus(storeSession,call.id,'open',call.updated_at);
  const bytes=await readFile(new URL('../public/ad-assets/design-v2/'+file,import.meta.url));
  const creative=await makerRepo.createCreative(makerSession,{product_id:product.id,headline:title,note:'SIG01-03 test',assets:{signage:{kind:'image',path:'blob:'+file,upload:new Blob([bytes],{type:'image/png'}),width:0,height:0,bytes:bytes.length,file_name:file}}},randomUUID());
  const a=await makerRepo.submitApplication(makerSession,call.id,{creative_version_id:creative.versions[0].id,channels:['signage'],requested_start:begins,requested_end:end,message:'SIG01-03 test'});applications.push(a.id);
  const approval=await store.rpc('kago_approve_application',{p_application_id:a.id,p_expected_revision:1,p_channels:['signage']});assert.ifError(approval.error);
  return {placement:approval.data[0].placement_id,version:creative.versions[0].id,application:a.id};
 }
 const a=await prepare('A',endsA,'CR2_v1_signage.png'),b=await prepare('B',endsB,'CR2_v2_signage.png');report.ids={a:a.placement,b:b.placement,a_version:a.version,b_version:b.version};await pass('two_isolated_approved_signage_versions');
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/google-chrome',headless:true});
 const ctx=await browser.newContext({viewport:{width:1280,height:720},permissions:[]});
 await ctx.addInitScript(()=>{Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{throw new DOMException('Camera disabled','NotAllowedError');}});});
 const page=await ctx.newPage();await page.goto(base+'/signage/play?debug=1');await page.locator('input[name="email"]').fill(credential('DV1').email);await page.locator('input[name="password"]').fill(credential('DV1').password);await page.getByRole('button',{name:'ログインして表示を始める',exact:true}).click();
 const debug=page.getByTestId('signage-debug');
 await debug.filter({hasText:a.placement}).waitFor({timeout:60000});
 assert.ok(await page.locator('img').evaluateAll(imgs=>imgs.some(i=>i.complete&&i.naturalWidth>0)));
 await debug.filter({hasText:b.placement}).waitFor({timeout:60000});
 const plays=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('kago-signage-outbox-v1:db')??'[]'));
 const first=(await plays()).find(p=>p.ad_placement_id===a.placement&&p.ended_at);assert.ok(first);assert.ok(Date.parse(first.ended_at)-Date.parse(first.started_at)>=3000);
 assert.equal(first.creative_version_id,a.version);assert.equal(first.mode,'schedule');assert.equal(first.reason_code,'approved_order');
 await pass('real_a_then_b_order_image_decoded_minimum_three_seconds');
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await ctx.setOffline(true);await page.getByRole('button',{name:'通信を切る（確認用）',exact:true}).click();await debug.filter({hasText:'通信：切断'}).waitFor();
 await page.reload();await debug.waitFor();
 await poll(async()=>{const t=await debug.textContent();return t.includes(a.placement)||t.includes(b.placement);});
 assert.ok(await page.locator('img').evaluateAll(imgs=>imgs.some(i=>i.complete&&i.naturalWidth>0)));
 await pass('real_private_image_cache_survives_offline_reload');
 await poll(async()=>Date.now()>Date.parse(endsB)+1200);
 assert.ok(!(await debug.textContent()).includes(b.placement));await debug.filter({hasText:a.placement}).waitFor();
 await pass('expired_b_stops_while_offline_a_remains_valid');
 const stopped=await store.rpc('kago_suspend_placement',{p_placement_id:a.placement,p_reason:'SIG01-03 offline stop'});assert.ifError(stopped.error);
 assert.ok((await debug.textContent()).includes(a.placement));
 // Expire only this test browser's cached feed. The wall clock and real play timestamps remain unchanged.
 await page.evaluate(()=>{const key='kago-signage-feed-v1:db',feed=JSON.parse(localStorage.getItem(key));feed.expires_at=new Date(Date.now()-1000).toISOString();localStorage.setItem(key,JSON.stringify(feed));});
 await page.reload();await debug.filter({hasText:'cache_expired'}).waitFor({timeout:30000});assert.match(await debug.textContent(),/表示中：案内/);
 await pass('expired_cache_injection_shows_fallback_without_time_warp');
 const pending=(await plays()).filter(p=>p.ended_at).map(p=>p.id);assert.ok(pending.length>0);report.pending_ids=pending;
 await ctx.setOffline(false);await page.getByRole('button',{name:'通信を戻す',exact:true}).click();await debug.filter({hasText:'通信：OK'}).waitFor({timeout:60000});
 await poll(async()=>!(await plays()).some(p=>p.ended_at));
 const rows=await store.from('signage_plays').select('id,ad_placement_id,creative_version_id,started_at,ended_at,mode,reason_code,end_reason').in('id',pending);assert.ifError(rows.error);assert.equal(rows.data.length,new Set(pending).size);
 for(const row of rows.data){if(row.ad_placement_id===a.placement)assert.equal(row.creative_version_id,a.version);if(row.ad_placement_id===b.placement)assert.equal(row.creative_version_id,b.version);}
 assert.ok(!(await debug.textContent()).includes(a.placement));assert.ok(!(await debug.textContent()).includes(b.placement));
 await page.reload();await debug.filter({hasText:'通信：OK'}).waitFor();const repeated=await store.from('signage_plays').select('id').in('id',pending);assert.ifError(repeated.error);assert.equal(repeated.data.length,new Set(pending).size);
 report.saved_play_count=rows.data.length;await pass('reconnect_honors_stop_and_expiry_resends_exact_ids_without_duplicates');
 await page.getByRole('button',{name:'端末からログアウト',exact:true}).click();await page.getByRole('heading',{name:'端末のログイン',exact:true}).waitFor();await page.reload();await page.getByRole('heading',{name:'端末のログイン',exact:true}).waitFor();
 await pass('logout_reload_never_restores_old_ads');report.status='PASS';
}catch(error){
 report.status='FAIL';
 let message=error instanceof Error?(error.stack??error.message):String(error);const secrets=[...Object.values(settings),...[...text.matchAll(/^(?:メール|パスワード) = (.+)$/gm)].map(m=>value(m[1]))].filter(v=>typeof v==='string'&&v.length>=6);for(const secret of secrets)message=message.split(secret).join('[redacted]');console.error(message.replace(/https?:\/\/\S+/g,'[URL]'));process.exitCode=1;
}finally{
 try{for(const id of applications){const active=await store.from('ad_placements').select('id').eq('application_id',id).eq('status','active');assert.ifError(active.error);for(const p of active.data){const result=await store.rpc('kago_suspend_placement',{p_placement_id:p.id,p_reason:'SIG01-03 cleanup'});assert.ifError(result.error);}}
 for(const id of calls){const call=await storeRepo.getAdCall({role:'store_staff',storeId:session.storeId},id);if(call.status==='open')await storeRepo.setAdCallStatus({role:'store_staff',storeId:session.storeId},id,'closed',call.updated_at);}report.cleanup='dedicated calls closed; active placements suspended';
 }finally{await persist();await browser?.close();await Promise.all(clients.map(c=>signOutBackend(c).catch(()=>{})));if(server?.exitCode===null)server.kill();}
}
