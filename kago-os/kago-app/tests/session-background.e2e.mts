// Session checks in the background: the shopping screen stays while /api/shopping is re-checked,
// in-flight cart writes are not aborted, and only identity/visit changes remount private data.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Page } from "playwright";
import { createCartBackend } from "./fixtures/cart-backend.mts";

const fixture = await createCartBackend();
const origin = "http://127.0.0.1:3113";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3113"], {
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: fixture.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let log = ""; server.stdout.on("data", c => { log += c; }); server.stderr.on("data", c => { log += c; });
let browser; const passed: string[] = []; const pass = (s: string) => { passed.push(s); console.log("PASS: " + s); };
const LOADING = "ログインと買い物の状態を確認しています…";
try {
  for (let i = 0; i < 90; i++) { if (server.exitCode !== null) throw Error(log); try { if ((await fetch(origin + "/api/shopping")).status === 401) break; } catch { /* starting */ } if (i === 89) throw Error(log); await delay(1000); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const a = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await a.newPage(); page.setDefaultTimeout(45000);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const wait = (text: string, p: Page = page) => p.getByText(text, { exact: true }).first().waitFor();
  await page.goto(origin + "/App"); await page.getByLabel("メールアドレス").fill("user3@example.test"); await page.getByLabel("パスワード", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click(); await page.getByRole("button", { name: "続きから開く", exact: true }).first().click();
  await page.getByRole("button", { name: "検証ミルクをかごに追加", exact: true }).waitFor(); await wait("かごを最新の状態にしました。");

  // A slow background check (tab focus): the screen and the scan/catalog stay usable; a cart add completes.
  let slow = 0;
  await page.route("**/api/shopping", async route => { if (route.request().method() === "GET") { slow++; await delay(4000); } await route.continue(); });
  await page.evaluate(() => { (window as unknown as { __seenLoading: boolean }).__seenLoading = false;
    new MutationObserver(() => { if (document.body.innerText.includes("ログインと買い物の状態を確認しています")) (window as unknown as { __seenLoading: boolean }).__seenLoading = true; })
      .observe(document.body, { subtree: true, childList: true, characterData: true }); });
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.getByRole("button", { name: "検証ミルクをかごに追加", exact: true }).click();
  await wait("かごを保存しました。");
  for (let i = 0; i < 80 && slow === 0; i++) await delay(100);
  await delay(4500);
  assert(slow > 0, "a background check ran");
  assert.equal(await page.evaluate(() => (window as unknown as { __seenLoading: boolean }).__seenLoading), false, "no blank loading screen during the check");
  assert.equal(await page.getByText("保存結果が未確認の操作があります。同じ操作を再試行してください。").count(), 0);
  const cart = await (await a.request.get(origin + "/api/cart")).json();
  assert.equal(cart.cart[0].quantity, 1);
  await page.unroute("**/api/shopping");
  pass("a background session check keeps the shopping screen and does not abort a cart write");

  // The interval / on-demand checks behave the same (no remount): component state survives.
  await page.getByLabel("商品名・商品コードで検索", { exact: true }).fill("りんご");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await delay(2500);
  assert.equal(await page.getByLabel("商品名・商品コードで検索", { exact: true }).inputValue(), "りんご", "typed input survives a check");
  assert.equal(await page.getByText(LOADING).count(), 0);
  pass("checks do not remount the screen: typed search text survives");

  // Another tab switches the visit: this tab follows in the background and remounts for the new store.
  const other = await a.newPage();
  await other.goto(origin + "/App"); await wait("ログイン中の利用者の買い物", other);
  await other.getByRole("button", { name: "店舗・来店を選ぶ", exact: true }).click();
  await other.getByRole("button", { name: /続きから開く|この店舗で買い物を始める/ }).nth(1).click();
  await wait("ログイン中の利用者の買い物", other);
  const otherStore = await other.locator("div.border-b span.font-bold").first().innerText();
  await page.locator("div.border-b span.font-bold").filter({ hasText: otherStore }).waitFor({ timeout: 15000 });
  assert.equal(await page.getByLabel("商品名・商品コードで検索", { exact: true }).inputValue(), "", "the new visit starts with fresh screen state");
  pass("a visit change in another tab is followed without a blank screen and remounts for the new visit");

  // Signing out in another tab still hides private data at once.
  await other.getByRole("button", { name: "ログアウト", exact: true }).click();
  await wait("買い物をはじめる", page);
  assert.equal(await page.getByText("ログイン中の利用者の買い物", { exact: true }).count(), 0);
  pass("sign-out in another tab hides private data immediately");

  assert.deepEqual(errors, []);
  console.log(`${passed.length} session background scenarios passed.`);
} finally { await browser?.close(); server.kill(); await fixture.close(); }
