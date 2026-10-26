// Next UI/API with official migrations/RLS in PGlite; Auth/PostgREST are local adapters.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";

const fixture = await createCartBackend(), base = "http://127.0.0.1:3258";
let log = "";
const env = { ...process.env, KAGO_NEXT_DIST_DIR: ".next/cart-recovery", KAGO_DEMO_ENABLED: "0", NEXT_PUBLIC_SUPABASE_URL: fixture.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" };
function next(...args: string[]) {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", ...args], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", c => log = (log + c).slice(-4000)); child.stderr.on("data", c => log = (log + c).slice(-4000));
  return child;
}
let server: ReturnType<typeof next> | undefined, browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const passed: string[] = [], pass = (s: string) => { passed.push(s); console.log("PASS " + s); };
try {
  const build = next("build", "--webpack");
  const built = await new Promise<number | null>(resolve => build.once("exit", resolve));
  assert.equal(built, 0, log);
  server = next("start", "--hostname", "127.0.0.1", "--port", "3258");
  for (let i = 0; i < 90; i++) { if (server.exitCode !== null) throw Error(log); try { if ((await fetch(base + "/api/shopping", { signal: AbortSignal.timeout(3000) })).status === 401) break; } catch { /* Server is starting. */ } if (i === 89) throw Error(log); await delay(500); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "/usr/bin/google-chrome" });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  // Unrelated recommendation retries must not interfere with the cart recovery being tested.
  await page.route("**/api/recommendations", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "connection_failed" }) }));
  await page.goto(base + "/App"); await page.getByLabel("メールアドレス").fill("user3@example.test"); await page.getByLabel("パスワード", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("button", { name: /前回の店舗から再開|この店舗で買い物を始める/ }).click();
  await page.getByText("かごを最新の状態にしました。", { exact: true }).first().waitFor();
  const snapshot = async () => { const r = await context.request.get(base + "/api/cart"); assert.equal(r.status(), 200); return r.json(); };
  const cart = await snapshot();
  const seed = await context.request.post(base + "/api/cart", { headers: { Origin: base }, data: {
    action: "set", visitId: cart.visit.id, productId: id(20), quantity: 2, source: "manual", requestId: randomUUID(), expectedVersion: cart.visit.cart_version,
  } }); assert.equal(seed.status(), 200, await seed.text());
  await page.reload(); await page.getByText("かごを最新の状態にしました。", { exact: true }).first().waitFor();
  const basket = page.getByRole("dialog", { name: "買い物かご", exact: true });
  const recovery = page.getByRole("alertdialog", { name: "お買い物のお知らせ", exact: true });
  const retry = () => page.getByRole("button", { name: "同じ操作を再試行", exact: true });
  const writes = () => fixture.calls.filter(c => c.name === "app_set_cart_item");
  assert.equal(await recovery.count(), 0); pass("正常な再読込では復旧警告を表示しない");

  await page.getByRole("button", { name: "買い物かごを開く、現在2点", exact: true }).click();
  let abortedId = "";
  await page.route("**/api/cart", async route => {
    if (route.request().method() === "POST") { abortedId = route.request().postDataJSON().requestId; await route.abort("failed"); }
    else await route.continue();
  });
  await basket.getByRole("button", { name: /検証ミルク.*減/ }).click(); await retry().waitFor();
  assert.equal((await snapshot()).cart[0].quantity, 2);
  const before = writes().length; await page.unroute("**/api/cart"); await page.reload();
  await recovery.waitFor({ timeout: 6000 }); await retry().waitFor();
  assert.equal(writes().length, before);
  await page.reload(); await recovery.waitFor(); await retry().waitFor(); assert.equal(writes().length, before);
  pass("DB未反映の保存を複数回再読込しても、再試行の入口と操作を保持し自動送信しない");
  await retry().click(); await recovery.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "買い物かごを開く、現在1点", exact: true }).waitFor();
  assert.equal((await snapshot()).cart[0].quantity, 1); assert.equal(writes().at(-1)!.body.p_request_id, abortedId);
  pass("未反映の操作は元のIDで明示再試行でき、数量変更が保存される");

  await page.getByRole("button", { name: "買い物かごを開く、現在1点", exact: true }).click();
  let committedId = "";
  await page.route("**/api/cart", async route => {
    if (route.request().method() === "POST") { committedId = route.request().postDataJSON().requestId; await route.fetch(); await route.abort("failed"); }
    else await route.continue();
  });
  await basket.getByRole("button", { name: /検証ミルク.*減/ }).click(); await retry().waitFor();
  assert.equal((await snapshot()).cart.length, 0);
  const committed = writes().length; await page.unroute("**/api/cart"); await page.reload();
  await recovery.waitFor(); await retry().waitFor(); assert.equal(writes().length, committed);
  assert.equal(await page.locator(".shopping-cart-summary").count(), 0);
  pass("最後の商品が削除済みでかごバナーがなくても、応答喪失後に復旧できる");
  await mkdir("../../internal/cart-recovery-evidence", { recursive: true });
  await page.screenshot({ path: "../../internal/cart-recovery-evidence/cart-recovery.png", animations: "disabled" });
  await retry().click(); await recovery.waitFor({ state: "hidden" });
  await page.getByText("かごを保存しました。", { exact: true }).first().waitFor();
  assert.equal((await snapshot()).cart.length, 0);
  assert.equal(writes().at(-1)!.body.p_request_id, committedId);
  assert.equal(writes().at(-2)!.body.p_request_id, committedId);
  pass("反映済みの操作も同じIDで確認でき、保存を重ねず未確認状態を解消");
  await page.reload(); await page.getByText("かごを最新の状態にしました。", { exact: true }).first().waitFor();
  assert.equal(await recovery.count(), 0); assert.equal(await retry().count(), 0);
  assert.deepEqual(errors, []); pass("解消後の再読込では復旧警告が再表示されない");
  console.log(passed.length + " cart recovery browser scenarios passed.");
} catch (error) { console.error(log.slice(-1500)); throw error; }
finally { await browser?.close(); server?.kill(); await fixture.close(); }
