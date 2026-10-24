// APP-08: actual Next UI/API and formal migrations/RLS. Delays intercept responses, not DB behavior.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Page, type Route } from "playwright";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";
import { PRODUCT } from "./fixtures/offers.mts";
import { seedEventSuggestions } from "./fixtures/app-events.mts";
import type { SavedSelection } from "../src/features/recommendations/selection-contracts.ts";

const fixture = await createCartBackend({ offers: true });
await seedEventSuggestions(fixture);
const origin = "http://127.0.0.1:3118", output = resolve("../../internal/app08-evidence");
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3118"], {
  env: { ...process.env, KAGO_NEXT_DIST_DIR: ".next/app08-e2e", KAGO_DEMO_ENABLED: "0", NEXT_PUBLIC_SUPABASE_URL: fixture.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" },
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let log = ""; server.stdout.on("data", c => { log += c; }); server.stderr.on("data", c => { log += c; });
let browser, page: Page | undefined;
const passed: string[] = [], pass = (message: string) => { passed.push(message); console.log("PASS: " + message); };
async function until(check: () => Promise<boolean>) {
  for (let i = 0; i < 200; i++) { if (await check()) return; await delay(50); }
  throw Error("Condition did not become true");
}
try {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw Error(log);
    try { if ((await fetch(origin + "/api/shopping")).status === 401) break; } catch { /* starting */ }
    if (i === 59) throw Error(log); await delay(1000);
  }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  page = await context.newPage(); const p = page; p.setDefaultTimeout(30000);
  await p.clock.install();
  const errors: string[] = []; p.on("pageerror", e => errors.push(e.message));
  const region = () => p.getByRole("region", { name: "あなたへのおすすめ" });
  const card = () => region().getByRole("article");
  let requests = 0, intercept: ((route: Route) => Promise<void>) | null = null;
  await p.route("**/api/recommendations", async route => { requests++; if (intercept) await intercept(route); else await route.continue(); });
  const cart = async () => (await (await context.request.get(origin + "/api/cart")).json());
  const shownVersion = async () => {
    if (await card().count() !== 1) return -1;
    const slot = await card().getAttribute("data-selection-item-id");
    return (await fixture.db.query<{ cart_version: number }>("select s.cart_version from selections s join selection_items i on i.selection_id=s.id where i.id=$1", [slot])).rows[0]?.cart_version ?? -1;
  };
  const ready = (version: number) => until(async () => await shownVersion() === version);
  const saved = () => p.getByText("かごを保存しました。", { exact: true }).waitFor();
  const scan = async (code: string) => {
    await p.getByLabel("商品コードを入力", { exact: true }).fill(code);
    await p.getByRole("button", { name: "コードで追加", exact: true }).click();
  };
  function holdNext() {
    let release!: () => void, held: SavedSelection | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    intercept = async route => {
      intercept = null;
      const response = await route.fetch(); held = await response.json(); await gate;
      try { await route.fulfill({ response }); } catch { /* The obsolete browser request may already be cancelled. */ }
    };
    return { release, data: () => held };
  }
  await p.goto(origin + "/App");
  await p.getByLabel("メールアドレス").fill("user3@example.test");
  await p.getByLabel("パスワード", { exact: true }).fill("fixture-password");
  await p.getByRole("button", { name: "ログイン", exact: true }).click();
  await p.getByRole("button", { name: "続きから開く", exact: true }).first().click(); await ready(0);
  const initial = requests;
  await p.getByLabel("商品コードを入力", { exact: true }).fill("2900000000100");
  await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await delay(500);
  assert.equal(requests, initial, "same-version rerenders and background session checks must not select again");
  pass("visit/cart load selects once; same-version rerenders and background checks do not reselect");

  const first = holdNext(); await scan("2900000000100"); await saved();
  await until(async () => !!first.data());
  assert.equal((await cart()).visit.cart_version, 1);
  assert.equal(await card().count(), 0);
  await region().getByRole("status", { name: "かごに合わせておすすめを更新しています" }).waitFor();
  await region().evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
  await p.screenshot({ path: resolve(output, "updating-mobile.png") });
  first.release(); await ready(1);
  assert.equal(await region().locator('article[aria-label="広告：トマトパスタソース"]').count(), 1);
  await region().getByRole("button", { name: "おすすめの自動切り替えを停止" }).click();
  await card().getByRole("button", { name: /をかごに追加/ }).click(); await saved(); await ready(2);
  assert.equal(await region().locator('article[aria-label="広告：トマトパスタソース"]').count(), 0);
  assert.equal((await cart()).cart.find((line: {productId:string}) => line.productId === PRODUCT.sauce)?.quantity, 1);
  await region().getByRole("button", { name: "おすすめの自動切り替えを再開" }).waitFor();
  pass("pasta scan updates to sauce; adding the sauce excludes it, keeps each cart write and preserves manual pause");

  await p.getByRole("button", { name: /買い物かごを開く/ }).click();
  await p.getByRole("button", { name: "トマトパスタソースを削除", exact: true }).click(); await saved(); await ready(3);
  await p.getByRole("button", { name: "閉じる", exact: true }).click();
  assert.equal(await region().locator('article[aria-label="広告：トマトパスタソース"]').count(), 1);
  await card().getByRole("button", { name: /の詳細/ }).click(); await p.getByRole("dialog").waitFor();
  const old = holdNext();
  await fixture.rpc("app_set_cart_item", [id(13), crypto.randomUUID(), PRODUCT.pasta, 2, 3, "manual", null]);
  await p.evaluate(() => { const channel = new BroadcastChannel("kago-cart-updated"); channel.postMessage("updated"); channel.close(); });
  await until(async () => !!old.data());
  assert.equal(await p.getByRole("dialog").count(), 0, "a detail from the older cart must close immediately");
  assert.equal(await card().count(), 0);
  await p.getByRole("button", { name: /買い物かごを開く/ }).click();
  await p.getByRole("button", { name: "スパゲッティ 500gを1点増やす", exact: true }).click(); await saved(); await ready(5);
  await p.getByRole("button", { name: "閉じる", exact: true }).click();
  const newestSlot = await card().getAttribute("data-selection-item-id");
  old.release(); await delay(1300);
  assert.equal(await card().getAttribute("data-selection-item-id"), newestSlot);
  const oldSlots = old.data()!.items.map(i => i.selectionItemId);
  const obsoleteImpressions = await fixture.db.query<{n:number}>("select count(*)::int n from events where event_type='recommendation_impression' and selection_item_id=any($1::uuid[])", [oldSlots]);
  assert.equal(obsoleteImpressions.rows[0].n, 0);
  pass("another-tab cart update closes obsolete details; a newer response wins and unseen old slots never gain impressions");

  // Control only browser time during the burst, so slow test hardware cannot accidentally cross 250ms.
  // All three writes still execute and commit through the real API/SQL before the selection timer runs.
  await p.getByRole("button", { name: /買い物かごを開く/ }).click();
  const plus = p.getByRole("button", { name: "スパゲッティ 500gを1点増やす", exact: true });
  const beforeBurst = requests;
  await p.clock.pauseAt(await p.evaluate(() => Date.now()));
  for (let i = 0; i < 3; i++) {
    const response = p.waitForResponse(r => r.url() === origin + "/api/cart" && r.request().method() === "POST" && r.request().postDataJSON().action === "set");
    await plus.dispatchEvent("click"); assert.equal((await response).status(), 200);
    await until(() => plus.isEnabled());
  }
  await p.clock.runFor(260); await p.clock.resume();
  await ready(8); assert.equal((await cart()).visit.cart_version, 8);
  assert.equal(requests - beforeBurst, 1, "three individually committed writes should coalesce to the last selection");
  const versions = (await fixture.db.query<{v:number}>("select (payload->>'cart_version')::int v from events where event_type in ('cart_item_added','cart_item_removed','cart_quantity_changed') and visit_id=$1 order by v", [id(13)])).rows.map(r => r.v);
  assert.deepEqual(versions, [1,2,3,4,5,6,7,8]);
  pass("three rapid quantity saves keep all cart events/versions but send only one selection request");

  // Advance the DB after the UI saved v9 but before its next selection reads it. No BroadcastChannel notification.
  intercept = async route => {
    intercept = null;
    await fixture.rpc("app_set_cart_item", [id(13), crypto.randomUUID(), PRODUCT.pasta, 12, 9, "manual", null]);
    await route.continue();
  };
  await plus.click(); await saved(); await ready(10);
  assert.equal((await cart()).visit.cart_version, 10);
  assert.equal(await region().getByRole("alert").count(), 0);
  pass("a server-ahead result reloads the cart and automatically recovers to the latest saved version");

  const beforeMismatch = requests;
  intercept = async route => { await route.fulfill({ json: { visitId:id(13),cartVersion:-1,ruleVersion:1,selectionId:null,items:[] } }); };
  await plus.click(); await saved();
  await region().getByRole("button", { name: "おすすめを再試行", exact: true }).waitFor();
  assert.equal(requests - beforeMismatch, 2, "retry must be bounded");
  assert.equal((await cart()).visit.cart_version, 11); assert.equal(await card().count(), 0);
  intercept = null; await p.getByRole("button", { name: "閉じる", exact: true }).click();
  await region().getByRole("button", { name: "おすすめを再試行", exact: true }).click(); await ready(11);
  pass("persistent mismatches stop after one retry; shopping still saves and the retry button restores suggestions");

  const beforeFailure = requests;
  await scan("UNKNOWN-CODE");
  await p.getByText("この店舗に登録されていない商品です。商品一覧から選ぶか、店員へお尋ねください。", {exact:true}).waitFor();
  await delay(400); assert.equal(requests, beforeFailure); await ready(11);
  const slot = await card().getAttribute("data-selection-item-id");
  await card().evaluate(el => el.scrollIntoView({block:"center",behavior:"instant"})); await delay(1300);
  const countImpressions = async () => (await fixture.db.query<{n:number}>("select count(*)::int n from events where event_type='recommendation_impression' and selection_item_id=$1",[slot])).rows[0].n;
  assert.equal(await countImpressions(),1);
  const selectionCount = (await fixture.db.query<{n:number}>("select count(*)::int n from selections where visit_id=$1",[id(13)])).rows[0].n;
  await p.reload(); await ready(11);
  await card().evaluate(el => el.scrollIntoView({block:"center",behavior:"instant"})); await delay(1300);
  assert.equal(await card().getAttribute("data-selection-item-id"),slot); assert.equal(await countImpressions(),1);
  assert.equal((await fixture.db.query<{n:number}>("select count(*)::int n from selections where visit_id=$1",[id(13)])).rows[0].n, selectionCount);
  await p.screenshot({ path: resolve(output,"latest-mobile.png") });
  pass("failed scans do not reselect; reloading the same cart reuses the saved selection and never doubles an impression");
  assert.equal(errors.length,0,errors.join("\n"));
  assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await writeFile(resolve(output,"result.json"),JSON.stringify({passed},null,2));
  console.log(`${passed.length} browser/DB scenarios passed.`);
} catch(error) {
  if(page) { await page.screenshot({path:resolve(output,"failure.png"),fullPage:true}); console.log((await page.locator("body").innerText()).slice(0,2000)); }
  await writeFile(resolve(output,"server.log"),log); throw error;
} finally { await browser?.close(); server.kill(); await fixture.close(); }
