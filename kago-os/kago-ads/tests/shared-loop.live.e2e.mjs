import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createHeadlessBackend,getBackendIdentity,signInBackend,signOutBackend} from '@kago/backend';
import {createSupabaseMakerRepository} from '../src/lib/backend/maker.ts';
import {createSupabaseStoreCallsRepository,requireStore} from '../src/lib/backend/store-calls.ts';

assert.equal(process.env.KAGO_SHARED_LOOP,'1','Explicit shared-loop opt-in required');
assert.ok(process.env.KAGO_CONNECTION_FILE,'Private connection file required');
const text=await readFile(process.env.KAGO_CONNECTION_FILE,'utf8');
const value=s=>{try{return JSON.parse(s.trim());}catch{return s.trim();}};
const settings=Object.fromEntries([...text.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)].map(m=>[m[1],value(m[2])]));
function credential(alias){
 let active=false,email='',password='';
 for(const line of text.split(/\r?\n/)){
  if(line.startsWith('[')){active=new RegExp('^\\['+alias+'(?:/[^\\]]+)?\\]$').test(line);continue;}
  if(active&&line.startsWith('メール = '))email=value(line.slice('メール = '.length));
  if(active&&line.startsWith('パスワード = '))password=value(line.slice('パスワード = '.length));
 }
 assert.ok(email&&password,'Missing account '+alias);return {email,password};
}
const adsRoot=fileURLToPath(new URL('../',import.meta.url));
const appRoot=fileURLToPath(new URL('../../kago-app/',import.meta.url));
const insightRoot=fileURLToPath(new URL('../../kago-insight/',import.meta.url));
const config={url:settings.NEXT_PUBLIC_SUPABASE_URL,publishableKey:settings.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY};
const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:config.publishableKey,
 NEXT_PUBLIC_ADS_DATA_SOURCE:'supabase',NEXT_PUBLIC_INSIGHT_DATA_SOURCE:'supabase',NEXT_PUBLIC_SIGNAGE_CROWD_SELECTION:'0',NEXT_PUBLIC_INSIGHT_BASE_PATH:'',KAGO_DEMO_ENABLED:'0'};
delete env.KAGO_DEMO_STORE_EMAIL;delete env.KAGO_DEMO_STORE_PASSWORD;
const app='http://127.0.0.1:3281',insight='http://127.0.0.1:3282',ads='http://127.0.0.1:3283';
const servers=[],clients=[],report={status:'running',checks:[],ids:{}};
let browser,customerContext,callId,promotionId,applicationId,placementId,storeSession;
const output=process.env.KAGO_SHARED_LOOP_REPORT??'/tmp/kago49-live.json';
async function persist(){await writeFile(output,JSON.stringify(report,null,2),{mode:0o600});}
async function pass(label){report.checks.push(label);await persist();console.log('PASS '+label);}
async function login(alias){const c=createHeadlessBackend(config);clients.push(c);const who=credential(alias);await signInBackend(c,who.email,who.password);return c;}
async function poll(fn){for(let i=0;i<150;i++){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,300));}throw Error('Condition timed out');}
async function build(root){await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[root+'node_modules/next/dist/bin/next','build','--webpack'],{cwd:root,env,stdio:'ignore'});p.on('error',reject);p.on('exit',n=>n===0?resolve():reject(Error('Production build failed')));});}
async function serve(root,port,path){const p=spawn(process.execPath,[root+'node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:root,env,stdio:'ignore'});servers.push(p);await poll(async()=>{if(p.exitCode!==null)throw Error('Server exited');try{return (await fetch('http://127.0.0.1:'+port+path)).status<500;}catch{return false;}});}
async function body(response){const result=await response.json();assert.equal(response.status(),200,JSON.stringify(result));return result;}
async function get(path){return body(await customerContext.request.get(app+path));}
async function post(path,data){return body(await customerContext.request.post(app+path,{headers:{Origin:app},data}));}

async function clearTestVisit(id){
 if(!id)return;
 const visit=await customer.from('visits').select('id,status,cart_version').eq('id',id).maybeSingle();assert.ifError(visit.error);
 if(visit.data?.status!=='active')return;
 const allowed=await customer.from('products').select('id').in('code',['2900000000100','2900000000162','2900000000056']);assert.ifError(allowed.error);
 const items=await customer.from('cart_items').select('product_id').eq('visit_id',id);assert.ifError(items.error);
 assert.ok(items.data.every(i=>allowed.data.some(p=>p.id===i.product_id)),'Unexpected item in dedicated test visit');
 let version=visit.data.cart_version;
 for(const item of items.data){
  const changed=await customer.rpc('app_set_cart_item',{p_visit_id:id,p_request_id:randomUUID(),p_product_id:item.product_id,p_quantity:0,p_expected_cart_version:version,p_source:'manual',p_selection_item_id:null});
  assert.ifError(changed.error);version=changed.data.visit.cart_version;
 }
}

const store=await login('T1'),maker=await login('M2'),customer=await login('U1'),device=await login('DV1');
const storeRepo=createSupabaseStoreCallsRepository(store),makerRepo=createSupabaseMakerRepository(maker);
try{
 const own=await requireStore(store),deviceIdentity=await getBackendIdentity(device,'signage');
 assert.ok(deviceIdentity.device);const terminal=deviceIdentity.device;assert.ok(own.storeIds.includes(terminal.storeId));
 storeSession={role:'store_staff',storeId:terminal.storeId};
 const identity=await getBackendIdentity(maker),members=await maker.from('maker_members').select('maker_id').eq('user_id',identity.userId);assert.ifError(members.error);assert.equal(members.data.length,1);
 const makerSession={role:'maker_staff',makerId:members.data[0].maker_id};
 const user=await getBackendIdentity(customer),existing=await customer.from('visits').select('id').eq('status','active').eq('store_id',terminal.storeId);assert.ifError(existing.error);assert.ok(existing.data.length<=1);
 for(const v of existing.data){const cart=await customer.from('cart_items').select('product_id').eq('visit_id',v.id);assert.ifError(cart.error);assert.equal(cart.data.length,0,'Existing cart must be empty');}
 const prefs=await customer.from('customer_settings').select('use_current_cart,use_purchase_history').eq('user_id',user.userId).single();assert.ifError(prefs.error);assert.ok(prefs.data.use_current_cart&&prefs.data.use_purchase_history,'U1 settings must already be enabled');
 const products=await store.from('products').select('id,code,name,category').in('code',['2900000000056','2900000000100','2900000000162','2900000000070']);assert.ifError(products.error);assert.equal(products.data.length,4);
 const product=code=>products.data.find(p=>p.code===code),bread=product('2900000000056'),yogurt=product('2900000000070');
 const starts=new Date(Date.now()-60000).toISOString(),ends=new Date(Date.now()+7200000).toISOString();
 const headline='TEST49 食パン '+new Date().toISOString();
 let call=await storeRepo.saveAdCall(storeSession,{title:headline,description:'TEST-01専用。検証後終了',categories:[bread.category],channels:['app','signage'],starts_at:starts,ends_at:ends,disclosure_scope:['impressions','clicks','cart_adds','purchases']});
 callId=call.id;report.ids.call=callId;await persist();call=await storeRepo.setAdCallStatus(storeSession,call.id,'open',call.updated_at);
 const asset=async(file)=>{const bytes=await readFile(new URL('../public/ad-assets/design-v2/'+file,import.meta.url));return {kind:'image',path:'blob:'+file,upload:new Blob([bytes],{type:'image/png'}),width:0,height:0,bytes:bytes.length,file_name:file};};
 const creative=await makerRepo.createCreative(makerSession,{product_id:bread.id,headline,note:'TEST49 shared loop',assets:{app:await asset('CR2_v1_app.png'),signage:await asset('CR2_v1_signage.png')}},randomUUID());
 report.ids.creative=creative.creative.id;report.ids.creative_version=creative.versions[0].id;
 const application=await makerRepo.submitApplication(makerSession,callId,{creative_version_id:creative.versions[0].id,channels:['app','signage'],requested_start:starts,requested_end:ends,message:'TEST49専用'});
 applicationId=application.id;report.ids.application=applicationId;await pass('store_call_maker_two_media_application');
 if(process.env.KAGO_E2E_SKIP_BUILD!=='1')await Promise.all([build(appRoot),build(insightRoot),build(adsRoot)]);
 await Promise.all([serve(appRoot,3281,'/App'),serve(insightRoot,3282,'/login'),serve(adsRoot,3283,'/signage/play')]);
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/google-chrome',headless:true});
 const staff=await browser.newContext({permissions:[]}),staffPage=await staff.newPage();
 await staffPage.goto(insight+'/review');await staffPage.locator('input[name="email"]').fill(credential('T1').email);await staffPage.locator('input[name="password"]').fill(credential('T1').password);await staffPage.getByRole('button',{name:'ログイン',exact:true}).click();
 await staffPage.getByRole('button').filter({hasText:headline}).first().click();
 await staffPage.getByRole('button',{name:'承認する',exact:true}).click();await staffPage.getByRole('button',{name:'この内容で承認',exact:true}).click();
 placementId=await poll(async()=>{const r=await store.from('ad_placements').select('id').eq('application_id',applicationId).eq('status','active');assert.ifError(r.error);return r.data[0]?.id;});report.ids.placement=placementId;
 await pass('insight_ui_approval_creates_real_placement');
 const parent=await store.from('store_promotions').insert({store_id:terminal.storeId,product_id:yogurt.id}).select('id').single();assert.ifError(parent.error);promotionId=parent.data.id;report.ids.promotion=promotionId;await persist();
 const promotionArgs={p_store_id:terminal.storeId,p_product_id:yogurt.id,p_channels:['app','signage'],p_time_windows:[],p_priority:100000,p_reason_text:'TEST49 更新前のお店のおすすめ',p_starts_at:starts,p_ends_at:ends,p_promotion_id:promotionId,p_expected_version:0};
 const promoted=await store.rpc('kago_save_promotion',promotionArgs);assert.ifError(promoted.error);const v1=promoted.data[0];report.ids.promotion_v1=v1.promotion_version_id;
 customerContext=await browser.newContext({viewport:{width:390,height:844},permissions:[]});
 await customerContext.addInitScript(()=>{Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{throw new DOMException('Camera disabled','NotAllowedError');}});});
 await post('/api/shopping',{action:'login',...credential('U1')});
 let shopping=await post('/api/shopping',{action:'start_visit',storeId:terminal.storeId,startNew:true,previousVisitId:existing.data[0]?.id??null});report.ids.visit=shopping.visit.id;await persist();
 async function set(code,quantity,selectionItemId){const snapshot=await get('/api/cart');return post('/api/cart',{action:'set',visitId:shopping.visit.id,requestId:randomUUID(),expectedVersion:snapshot.visit.cart_version,productId:product(code).id,quantity,source:selectionItemId?'recommendation':'manual',...(selectionItemId?{selectionItemId}:{})});}
 for(const code of ['2900000000100','2900000000162'])await set(code,1);
 const selection=await get('/api/recommendations'),ad=selection.items.find(i=>i.adPlacementId===placementId),promo=selection.items.find(i=>i.promotionVersionId===v1.promotion_version_id);assert.ok(ad,'New ad must be selected');assert.ok(promo,'Dedicated promotion must be selected');report.ids.selection=selection.selectionId;await pass('app_real_cookie_cart_selects_approved_ad_and_store_version');
 const page=await customerContext.newPage();await page.goto(app+'/App');
 async function show(item,label){await page.getByRole('button',{name:new RegExp('枚目：'+label+'$')}).click();const card=page.locator('[data-selection-item-id="'+item.selectionItemId+'"]');await card.waitFor();await poll(async()=>{const e=await customer.from('events').select('event_id').eq('selection_item_id',item.selectionItemId).eq('event_type','recommendation_impression');assert.ifError(e.error);return e.data.length>0;});return card;}
 await show(promo,'店舗からのおすすめ');const card=await show(ad,'広告');await card.getByRole('button',{name:'詳細を見る',exact:true}).click();
 const detail=page.getByRole('dialog');await detail.getByRole('heading',{name:bread.name,exact:true}).waitFor();
 await poll(async()=>detail.locator('img').evaluateAll(imgs=>imgs.some(i=>i.complete&&i.naturalWidth>0&&i.src.includes('/storage/v1/'))));
 await detail.getByRole('button',{name:'閉じる',exact:true}).click();await set('2900000000056',1,ad.selectionItemId);
 await pass('app_visible_impressions_detail_click_media_and_recommendation_add');
 const quote=await get('/api/checkout');assert.equal(quote.state,'review');const expected=quote.quote.lines.reduce((n,l)=>n+l.price*l.quantity,0)-quote.quote.discountTotal;assert.equal(quote.quote.total,expected);
 await page.goto(app+'/App/checkout');await page.getByRole('button',{name:'お会計を確定する',exact:true}).click();await page.getByRole('heading',{name:'お買い物が完了しました',exact:true}).waitFor();
 const receipt=await get('/api/checkout');assert.equal(receipt.state,'complete');assert.equal(receipt.receipt.total,expected);report.ids.order=receipt.receipt.orderId;
 const replay=await get('/api/checkout');assert.equal(replay.receipt.orderId,receipt.receipt.orderId);await pass('pseudo_checkout_total_receipt_reload_no_real_payment');
 const params={p_start:starts,p_end:ends,p_store_id:terminal.storeId};
 const metrics=await store.rpc('kago_app_metrics',params);assert.ifError(metrics.error);const row=metrics.data.find(r=>r.ad_placement_id===placementId);assert.ok(row);assert.equal(Number(row.shown_visits),1);assert.equal(Number(row.purchases),1);assert.equal(Number(row.recommendation_adds),1);assert.equal(Number(row.clicks),1);report.app_metrics=row;
 const makerMetrics=await maker.rpc('kago_app_metrics',params);assert.ifError(makerMetrics.error);assert.equal(Number(makerMetrics.data.find(r=>r.ad_placement_id===placementId).purchases),1);await pass('store_and_maker_metrics_match_visible_click_add_purchase');
 const terminalContext=await browser.newContext({permissions:[]}),terminalPage=await terminalContext.newPage();await terminalPage.goto(ads+'/signage/play?debug=1');await terminalPage.locator('input[name="email"]').fill(credential('DV1').email);await terminalPage.locator('input[name="password"]').fill(credential('DV1').password);await terminalPage.getByRole('button',{name:'ログインして表示を始める',exact:true}).click();
 await terminalPage.getByTestId('signage-debug').filter({hasText:placementId}).waitFor({timeout:60000});await terminalPage.reload();await terminalPage.getByTestId('signage-debug').waitFor();
 await poll(async()=>{const r=await store.from('signage_plays').select('id').eq('ad_placement_id',placementId);assert.ifError(r.error);return r.data.length>0;});await pass('signage_real_device_displays_approved_bread_and_records_play');
 const updated=await store.rpc('kago_save_promotion',{...promotionArgs,p_reason_text:'TEST49 更新後のお店のおすすめ',p_expected_version:1});assert.ifError(updated.error);const v2=updated.data[0];report.ids.promotion_v2=v2.promotion_version_id;assert.equal(v2.version,2);
 shopping=await post('/api/shopping',{action:'start_visit',storeId:terminal.storeId,startNew:true,previousVisitId:null});report.ids.next_visit=shopping.visit.id;
 for(const code of ['2900000000100','2900000000162'])await set(code,1);
 const next=await get('/api/recommendations');assert.ok(next.items.some(i=>i.promotionVersionId===v2.promotion_version_id));assert.ok(!next.items.some(i=>i.promotionVersionId===v1.promotion_version_id));
 const oldItem=await customer.from('selection_items').select('promotion_version_id').eq('id',promo.selectionItemId).single();assert.ifError(oldItem.error);assert.equal(oldItem.data.promotion_version_id,v1.promotion_version_id);
 const versions=await store.from('promotion_versions').select('id,status,reason_text').eq('promotion_id',promotionId);assert.ifError(versions.error);assert.equal(versions.data.find(v=>v.id===v1.promotion_version_id).status,'inactive');assert.equal(versions.data.find(v=>v.id===v2.promotion_version_id).status,'active');
 const history=await get('/api/account?history=1');assert.ok(history.orders.some(o=>o.id===receipt.receipt.orderId));
 await pass('next_visit_uses_v2_old_selection_and_purchase_history_preserved');
 for(const code of ['2900000000100','2900000000162'])await set(code,0);
 assert.equal((await get('/api/cart')).cart.length,0);
 await terminalPage.getByRole('button',{name:'端末からログアウト',exact:true}).click();await terminalContext.close();
 await staffPage.goto(insight+'/metrics');await staffPage.locator('h1').waitFor();assert.ok(!(await staffPage.locator('body').innerText()).includes('Application error'));await pass('insight_metrics_screen_reads_shared_result');
 report.status='PASS';
}catch(error){
 report.status='FAIL';
 let message=error instanceof Error?(error.stack??error.message):String(error);
 const secrets=[...Object.values(settings),...[...text.matchAll(/^(?:メール|パスワード) = (.+)$/gm)].map(m=>value(m[1]))].filter(v=>typeof v==='string'&&v.length>=6);
 for(const secret of secrets)message=message.split(secret).join('[redacted]');console.error(message.replace(/https?:\/\/\S+/g,'[URL]'));process.exitCode=1;
}finally{
 try{
  await clearTestVisit(report.ids.visit);await clearTestVisit(report.ids.next_visit);
  if(applicationId){const placements=await store.from('ad_placements').select('id').eq('application_id',applicationId).eq('status','active');assert.ifError(placements.error);for(const p of placements.data){const r=await store.rpc('kago_suspend_placement',{p_placement_id:p.id,p_reason:'TEST49 検証終了'});assert.ifError(r.error);}}
  if(promotionId){const r=await store.from('promotion_versions').update({status:'inactive'}).eq('promotion_id',promotionId).eq('status','active');assert.ifError(r.error);}
  if(callId){const latest=await storeRepo.getAdCall(storeSession,callId);if(latest.status==='open')await storeRepo.setAdCallStatus(storeSession,callId,'closed',latest.updated_at);}
  report.cleanup='call closed; ad suspended; dedicated promotions inactive';
 }finally{await persist();await browser?.close();await Promise.all(clients.map(c=>signOutBackend(c).catch(()=>{})));for(const p of servers)if(p.exitCode===null)p.kill();}
}
