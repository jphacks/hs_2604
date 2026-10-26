// Next UI/API + official migrations/RLS in PGlite; Auth/PostgREST are local adapters.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";

const fixture = await createCartBackend();
const base = "http://127.0.0.1:3256";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3256"], {
  env: { ...process.env, KAGO_NEXT_DIST_DIR: ".next/cart-refresh", KAGO_DEMO_ENABLED: "0", NEXT_PUBLIC_SUPABASE_URL: fixture.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" },
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let log = "", browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
server.stdout.on("data", c => log = (log + c).slice(-3000)); server.stderr.on("data", c => log = (log + c).slice(-3000));
const passed: string[] = []; const pass = (s: string) => { passed.push(s); console.log("PASS " + s); };
try {
  for (let i = 0; i < 90; i++) { if (server.exitCode !== null) throw Error(log); try { if ((await fetch(base + "/api/shopping")).status === 401) break; } catch { /* Server is starting. */ } if (i === 89) throw Error(log); await delay(500); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "/usr/bin/google-chrome" });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  // Cart recovery must also work when the independent recommendation service is unavailable.
  await page.route("**/api/recommendations", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "connection_failed" }) }));
  await page.goto(base + "/App"); await page.getByLabel("メールアドレス").fill("user3@example.test"); await page.getByLabel("パスワード", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click(); await page.getByRole("button", { name: /前回の店舗から再開|この店舗で買い物を始める/ }).click();
  await page.getByTestId("shopping-home").waitFor(); await page.getByText("かごを最新の状態にしました。", { exact: true }).first().waitFor();
  const snapshot = async () => { const r = await context.request.get(base + "/api/cart"); assert.equal(r.status(), 200); return r.json(); };
  const remoteQuantity = async (quantity: number) => {
    const cart = await snapshot();
    const r = await context.request.post(base + "/api/cart", { headers: { Origin: base }, data: {
      action: "set", visitId: cart.visit.id, requestId: randomUUID(), expectedVersion: cart.visit.cart_version, productId: id(20), quantity, source: "manual",
    } }); assert.equal(r.status(), 200, await r.text());
  };
  const focus = () => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const online = () => page.evaluate(() => window.dispatchEvent(new Event("online")));
  const count = (n: number) => page.getByRole("button", { name: "買い物かごを開く、現在" + n + "点", exact: true });
  let reads = 0; await page.route("**/api/cart", async route => { if (route.request().method() === "GET") reads++; await route.continue(); });
  await remoteQuantity(2); await focus(); await count(2).waitFor({ timeout: 6000 });
  pass("別端末相当の変更を、画面復帰で再取得して点数・金額へ反映");
  await remoteQuantity(3); await online(); await count(3).waitFor();
  pass("通信復帰でもかごを再取得");
  await remoteQuantity(4);
  await page.evaluate(() => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }));
  const hiddenReads = reads; await focus(); await online(); await delay(400); assert.equal(reads, hiddenReads);
  await page.evaluate(() => Reflect.deleteProperty(document, "visibilityState")); await focus(); await count(4).waitFor();
  pass("非表示中は取得せず、表示へ戻った時に更新");

  await count(4).click(); const basket = page.getByRole("dialog", { name: "買い物かご", exact: true });
  await page.unroute("**/api/cart"); reads = 0;
  await page.route("**/api/cart", async route => {
    if (route.request().method() === "POST") { await delay(700); await route.fetch(); await route.abort("failed"); }
    else { reads++; await route.continue(); }
  });
  const inFlightReads = reads;
  await basket.getByRole("button", { name: /検証ミルク.*減/ }).click();
  await focus(); await online(); await delay(200); assert.equal(reads, inFlightReads);
  pass("保存リクエスト中の復帰イベントでも保存を中断しない");
  await basket.getByRole("button", { name: "同じ操作を再試行", exact: true }).waitFor();
  const writes = () => fixture.calls.filter(c => c.name === "app_set_cart_item");
  const before = writes().length, pendingReads = reads;
  await focus(); await online(); await delay(400);
  assert.equal(reads, pendingReads); assert.equal(writes().length, before); assert.equal((await snapshot()).cart[0].quantity, 3);
  pass("結果未確認の保存中は再取得・自動再送をせず、未確認の操作を保持");
  await page.unroute("**/api/cart"); await basket.getByRole("button", { name: "同じ操作を再試行", exact: true }).click();
  await page.getByText("かごを保存しました。", { exact: true }).first().waitFor();
  assert.equal((await snapshot()).cart[0].quantity, 3);
  assert.equal(writes().at(-1)!.body.p_request_id, writes().at(-2)!.body.p_request_id);
  pass("明示的な再試行は同じ操作IDを使い、数量を重ねて増やさない");

  await page.route("**/api/cart", async route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "connection_failed" }) }));
  await focus(); await basket.getByRole("button", { name: "かごを再読み込み", exact: true }).waitFor();
  assert.match(await basket.locator(".shopping-basket-total").innerText(), /744/);
  await page.unroute("**/api/cart"); await remoteQuantity(6); await online();
  await basket.getByText("6点", { exact: true }).waitFor();
  assert.match(await basket.locator(".shopping-basket-total").innerText(), /1,488/);
  assert.equal(await basket.getByRole("button", { name: "かごを再読み込み", exact: true }).count(), 0);
  pass("再取得失敗でもかごを保持し、次の通信復帰で最新内容と通常表示へ回復");
  assert.deepEqual(errors, []);
  await mkdir("../../internal/cart-refresh-evidence", { recursive: true });
  await page.screenshot({ path: "../../internal/cart-refresh-evidence/cart-refresh.png", animations: "disabled" });
  console.log(passed.length + " cart refresh browser scenarios passed.");
} catch (error) { console.error(log.slice(-2000)); throw error; }
finally { await browser?.close(); server.kill(); await fixture.close(); }
