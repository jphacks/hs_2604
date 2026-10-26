// Next UI/API with official migrations/RLS in PGlite; Auth/PostgREST are local adapters.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";

const fixture = await createCartBackend(), base = "http://127.0.0.1:3262";
let log = "";
const env = { ...process.env, KAGO_NEXT_DIST_DIR: ".next/reminder-privacy", KAGO_DEMO_ENABLED: "0", NEXT_PUBLIC_SUPABASE_URL: fixture.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" };
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
  server = next("start", "--hostname", "127.0.0.1", "--port", "3262");
  for (let i = 0; i < 90; i++) { if (server.exitCode !== null) throw Error(log); try { if ((await fetch(base + "/api/shopping", { signal: AbortSignal.timeout(3000) })).status === 401) break; } catch { /* Server is starting. */ } if (i === 89) throw Error(log); await delay(500); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "/usr/bin/google-chrome" });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  // Unrelated recommendation retries must not interfere with the cart recovery being tested.
  await page.route("**/api/recommendations", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "connection_failed" }) }));
  let regularReads = 0, hold = false, fail = false, onCaptured: (() => void) | undefined;
  await page.route("**/api/regular-purchases", async route => {
    regularReads++;
    const r = await context.request.get(base + "/api/account"); assert.equal(r.status(), 200);
    const settings = await r.json(), enabled = settings.settings.usePurchaseHistory;
    if (hold && enabled) { onCaptured?.(); await delay(700); }
    const product = { productId: id(21), name: "検証りんご", code: "PLU-APPLE", category: "野菜", price: 158, available: true };
    const body = { visitId: settings.scope.visitId, status: enabled ? "ready" : "disabled", items: enabled ? [{
      product, purchaseCount: 4, intervalDays: 7, lastPurchasedAt: new Date(Date.now() - 8 * 86400000).toISOString(),
      daysSinceLastPurchase: 8, nextDueAt: new Date(Date.now() - 86400000).toISOString(), ratio: 1.14, status: "overdue",
    }] : [] };
    try { await route.fulfill({ status: fail ? 503 : 200, contentType: "application/json", body: JSON.stringify(fail ? { code: "connection_failed" } : body) }); }
    catch { /* A newer setting change may cancel this old response. */ }
  });
  await page.goto(base + "/App"); await page.getByLabel("メールアドレス").fill("user3@example.test"); await page.getByLabel("パスワード", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("button", { name: /前回の店舗から再開|この店舗で買い物を始める/ }).click();
  await page.getByText("かごを最新の状態にしました。", { exact: true }).first().waitFor();
  const settingsPage = await context.newPage(); await settingsPage.goto(base + "/App/account");
  const history = settingsPage.getByRole("switch", { name: "購入履歴をおすすめに使う", exact: true });
  const setHistory = async (enabled: boolean) => {
    assert.notEqual(await history.isChecked(), enabled); await history.click(); await settingsPage.getByText("設定を保存しました。", { exact: true }).waitFor();
    for (let i = 0; !(await history.isEnabled()); i++) { assert(i < 50); await delay(50); }
  };
  await setHistory(true); await page.reload();
  const card = page.locator(".regular-reminder-card"); await card.waitFor(); pass("履歴利用ONなら購入リマインダーを表示");
  const before = regularReads; await setHistory(false); await card.waitFor({ state: "hidden", timeout: 6000 });
  assert(regularReads > before); pass("別タブで履歴利用OFFにすると、再読込なしでリマインダーを隠す");
  hold = true; const captured = new Promise<void>(resolve => { onCaptured = resolve; });
  await setHistory(true); await captured; await setHistory(false); await delay(900);
  assert.equal(await card.count(), 0); hold = false; pass("遅れて届くON時の応答が、OFF後の表示を復活させない");
  await setHistory(true); await card.waitFor();
  fail = true; await setHistory(false); await card.waitFor({ state: "hidden" }); await delay(300);
  assert.equal(await card.count(), 0); pass("設定変更後の再取得が失敗しても、古い履歴由来の表示を残さない");
  await mkdir("../../internal/reminder-privacy-evidence", { recursive: true });
  await page.screenshot({ path: "../../internal/reminder-privacy-evidence/reminder-privacy.png", animations: "disabled" });
  assert.deepEqual(errors, []);
  console.log(passed.length + " reminder privacy scenarios passed.");
} catch (error) { console.error(log.slice(-1500)); throw error; }
finally { await browser?.close(); server?.kill(); await fixture.close(); }
