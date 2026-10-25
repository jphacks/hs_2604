// The login screen is not reloaded by the background checks (tab focus / 1-minute timer), so what is being
// typed stays; a login in another tab is still followed. Real Next API/UI; Auth/PostgREST use the test adapter.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { createCartBackend } from "./fixtures/cart-backend.mts";

const fixture = await createCartBackend();
const origin = "http://127.0.0.1:3126";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3126"], {
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: fixture.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let log = ""; server.stdout.on("data", c => { log += c; }); server.stderr.on("data", c => { log += c; });
let browser; const passed: string[] = []; const pass = (s: string) => { passed.push(s); console.log("PASS: " + s); };
try {
  for (let i = 0; i < 90; i++) { if (server.exitCode !== null) throw Error(log); try { if ((await fetch(origin + "/api/shopping")).status === 401) break; } catch { /* starting */ } if (i === 89) throw Error(log); await delay(1000); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // Run the session's 1-minute interval on demand instead of waiting.
  await context.addInitScript(() => {
    const minute: (() => void)[] = [];
    window.setInterval = new Proxy(window.setInterval, { apply(target, receiver, args) {
      if (args[1] === 60_000 && typeof args[0] === "function") minute.push(args[0]);
      return Reflect.apply(target, receiver, args);
    } });
    (window as unknown as { runMinute: () => void }).runMinute = () => minute.forEach(callback => callback());
  });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(origin + "/App");
  const email = page.getByLabel("メールアドレス"); await email.waitFor();
  await page.evaluate(() => { const w = window as unknown as { seenLoading: boolean }; w.seenLoading = false;
    new MutationObserver(() => { if (document.body.innerText.includes("ログインと買い物の状態を確認しています")) w.seenLoading = true; })
      .observe(document.body, { subtree: true, childList: true, characterData: true }); });
  let checks = 0; page.on("request", r => { if (r.url().endsWith("/api/shopping") && r.method() === "GET") checks++; });

  await email.fill("user3@example.test"); await page.getByLabel("パスワード", { exact: true }).fill("fixture-password");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.evaluate(() => (window as unknown as { runMinute: () => void }).runMinute());
  await delay(1500);
  assert.equal(checks, 0, "no session request while the login screen is shown");
  assert.equal(await page.evaluate(() => (window as unknown as { seenLoading: boolean }).seenLoading), false, "the login screen is not replaced by the loading screen");
  assert.equal(await email.inputValue(), "user3@example.test"); assert.equal(await page.getByLabel("パスワード", { exact: true }).inputValue(), "fixture-password");
  pass("tab focus and the 1-minute check do not reload the login screen; typed email/password stay");

  // Logging in from another tab is still followed by this tab.
  const other = await context.newPage();
  await other.goto(origin + "/App");
  await other.getByLabel("メールアドレス").fill("user3@example.test"); await other.getByLabel("パスワード", { exact: true }).fill("fixture-password");
  await other.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("heading", { name: "お買い物の店舗を選ぶ" }).waitFor({ timeout: 20000 });
  pass("a login in another tab still moves this tab past the login screen");

  // After logging in, the background check runs again (the shopping screen is kept up to date).
  const before = checks;
  await page.getByRole("button", { name: /前回の店舗から再開|この店舗で買い物を始める/ }).first().click();
  await page.getByText("かごを最新の状態にしました。", { exact: true }).first().waitFor();
  const afterStart = checks;
  await page.evaluate(() => (window as unknown as { runMinute: () => void }).runMinute());
  for (let i = 0; i < 30 && checks === afterStart; i++) await delay(100);
  assert.ok(checks > afterStart && afterStart >= before, "the 1-minute check runs once signed in");
  pass("once signed in, the periodic check runs as before");

  assert.deepEqual(errors, []);
  console.log(`${passed.length} login-screen scenarios passed.`);
} finally { await browser?.close(); server.kill(); await fixture.close(); }
