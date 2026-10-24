import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { createShoppingFixture, uuid } from './fixtures/shopping-backend.mjs';
const fixture = await createShoppingFixture();
const origin = 'http://127.0.0.1:3114';
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: fixture.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', KAGO_DEMO_ENABLED: '1', KAGO_DEMO_STORE_ID: uuid(1) };
for (const [i, email] of ['misaki.sato@example.test','ken.tanaka@example.test','yui.suzuki@example.test'].entries()) {
  env[`KAGO_DEMO_U${i+1}_EMAIL`] = email; env[`KAGO_DEMO_U${i+1}_PASSWORD`] = 'fixture-password';
}
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3114'], {env,stdio:['ignore','pipe','pipe']});
let log = ''; server.stdout.on('data', c => log += c); server.stderr.on('data', c => log += c);
let browser;
try {
  for (let i=0;i<90;i++) {
    try { if ((await fetch(`${origin}/api/shopping`)).ok) break; } catch {}
    if (i===89) throw new Error(log); await delay(1000);
  }
  browser = await chromium.launch({headless:true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH});
  const context = await browser.newContext({viewport:{width:390,height:844}});
  const page = await context.newPage();
  await page.goto(`${origin}/App`);
  const selector = page.getByLabel('デモ利用者を切り替える');
  await selector.waitFor();
  assert.equal(await page.getByLabel('パスワード',{exact:true}).count(),0);
  for (const [persona,n,product] of [['U1',3,'検証用ミルクA'],['U2',4,'検証用りんごB'],['U3',6,null]]) {
    await selector.selectOption(persona);
    await page.waitForFunction(p => document.querySelector('select[aria-label="デモ利用者を切り替える"]')?.value === p, persona);
    const r = await context.request.get(`${origin}/api/shopping`); const body = await r.json();
    assert.equal(r.status(),200); assert.equal(body.userId,uuid(n)); assert.equal(body.demo.user,persona);
    assert.equal(body.stores.length,1);
    if (product) assert.equal(body.cart[0].name,product); else assert.deepEqual(body.cart,[]);
    const cart = await context.request.get(`${origin}/api/cart`); assert.equal(cart.status(),200);
    await page.reload(); await selector.waitFor(); assert.equal(await selector.inputValue(),persona);
  }
  for (const body of [{action:'demo_select',user:'U4'},{action:'logout'},{action:'login',email:'other@example.test',password:'fixture-password'}]) {
    const r = await context.request.post(`${origin}/api/shopping`,{headers:{origin},data:body}); assert.equal(r.status(),403);
  }
  assert.equal((await context.request.post(`${origin}/api/shopping`,{headers:{origin:'https://other.example'},data:{action:'demo_select',user:'U1'}})).status(),403);
  const cookies = await context.cookies(); assert.ok(cookies.every(c=>!c.name.startsWith('sb-')));
  assert.ok(cookies.find(c=>c.name==='kago-demo-persona')?.httpOnly);
  const html = await page.content(); assert.ok(!html.includes('fixture-password')); assert.ok(!html.includes('misaki.sato@example.test'));
  await page.screenshot({path:'/tmp/kago114-demo-mobile.png',fullPage:true});
  await context.addCookies([{name:'kago-demo-persona',value:'U4',url:origin}]);
  assert.equal((await context.request.get(`${origin}/api/shopping`)).status(),403);
  assert.equal((await context.request.get(`${origin}/api/cart`)).status(),403);
  console.log('PASS: three server identities, isolated carts, reload, mobile UI, no login/token cookies, blocked invalid/cross-origin changes');
} finally {await browser?.close();server.kill();await fixture.close();}
