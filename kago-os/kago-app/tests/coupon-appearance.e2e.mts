// #162: real Next/API + official SQL/RLS; only the browser's random source is fixed.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Page } from "playwright";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";
import { PRODUCT } from "./fixtures/offers.mts";

const fixture = await createCartBackend({ offers: true });
await fixture.db.query(`insert into store_offers(id,store_id,kind,product_id,trigger_product_id,discount_percent,headline,starts_at,ends_at)
  values ($1,$2,'guerrilla_coupon',$3,$4,15,'ソース 15% OFF',now()-interval '1 hour',now()+interval '1 day')`,
  [id(180), id(1), PRODUCT.sauce, PRODUCT.basil]);
const origin = "http://127.0.0.1:3125", output = resolve("../../internal/coupon-frequency-evidence");
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3125"], {
  env: { ...process.env, KAGO_NEXT_DIST_DIR: ".next/coupon-frequency-e2e", KAGO_DEMO_ENABLED: "0", NEXT_PUBLIC_SUPABASE_URL: fixture.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" },
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let log = ""; server.stdout.on("data", c => { log += c; }); server.stderr.on("data", c => { log += c; });
let browser; let active: Page | undefined;
const passed: string[] = [], pass = (s: string) => { passed.push(s); console.log("PASS: " + s); };
try {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw Error(log);
    try { if ((await fetch(origin + "/api/shopping")).status === 401) break; } catch { /* starting */ }
    if (i === 59) throw Error(log); await delay(1000);
  }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    const random = Math.random;
    // Leave React/Next initialization randomness intact; fix only subsequent application draws.
    (window as unknown as { setCouponRoll: (value: number | null) => void }).setCouponRoll = value => {
      Math.random = value === null ? random : () => value;
    };
    // Fire only minute timeouts on demand. Do not jump auth/network deadlines or the session's interval.
    const minuteTimers = new Map<number, () => void>();
    window.setTimeout = new Proxy(window.setTimeout, { apply(target, receiver, args) {
      const timer = Reflect.apply(target, receiver, args) as number;
      if (args[1] === 60_000 && typeof args[0] === "function") minuteTimers.set(timer, args[0]);
      return timer;
    } });
    window.clearTimeout = new Proxy(window.clearTimeout, { apply(target, receiver, args) {
      minuteTimers.delete(args[0]); return Reflect.apply(target, receiver, args);
    } });
    (window as unknown as { runMinuteTimeouts: () => void }).runMinuteTimeouts = () => {
      for (const [timer, callback] of [...minuteTimers]) { window.clearTimeout(timer); callback(); }
    };
  });
  const page = await context.newPage(); active = page; page.setDefaultTimeout(30000);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const sticker = () => page.getByRole("button", { name: /^ゲリラクーポン：/ });
  const saved = () => page.getByText("かごを保存しました。", { exact: true }).waitFor();
  const ready = () => page.getByText("かごを最新の状態にしました。", { exact: true }).waitFor();
  const screenshot = async (name: string) => {
    await page.locator('section[aria-labelledby="suggestions-heading"][aria-busy="false"]').waitFor();
    await page.screenshot({ path: resolve(output, name) });
  };
  const roll = (n: number | null) => page.evaluate(value => (window as unknown as { setCouponRoll: (value: number | null) => void }).setCouponRoll(value), n);
  const settled = async (version: number) => {
    await page.waitForFunction(v => Object.keys(sessionStorage).some(key => key.startsWith("kago-coupon-appearance:") && JSON.parse(sessionStorage.getItem(key)!).cartVersion === v), version);
    await delay(100);
  };
  const scan = async () => {
    await page.getByLabel("商品コードを入力", { exact: true }).fill("2900000000100");
    await page.getByRole("button", { name: "コードで追加", exact: true }).click(); await saved();
  };
  const login = async (user: number) => {
    await page.getByLabel("メールアドレス").fill(`user${user}@example.test`);
    await page.getByLabel("パスワード", { exact: true }).fill("fixture-password");
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await page.getByRole("button", { name: "続きから開く", exact: true }).first().click(); await ready();
  };
  const poll = async () => {
    const response = page.waitForResponse(r => r.url().endsWith("/api/offers") && r.request().method() === "GET");
    await page.evaluate(() => (window as unknown as { runMinuteTimeouts: () => void }).runMinuteTimeouts());
    await response; await delay(100);
  };
  await page.goto(origin + "/App"); await login(3); await settled(0);
  await roll(0.99);
  assert.equal(await sticker().count(), 0);
  await scan(); await settled(1); await sticker().waitFor();
  await page.getByRole("article", { name: /セット割/ }).waitFor();
  await page.getByRole("article", { name: /タイムセール お惣菜/ }).waitFor();
  await screenshot("first-coupon-mobile.png");
  pass("empty eligibility does not consume the guaranteed first coupon, even with random=0.99");

  await sticker().click();
  await page.getByLabel("クーポン対象の商品コードを入力", { exact: true }).fill("2900000000179");
  await page.getByRole("button", { name: "商品を確認", exact: true }).click();
  await page.getByText("対象商品を確認しました：生バジル", { exact: true }).waitFor();
  await page.getByRole("button", { name: "割引付きでかごに追加", exact: true }).click(); await saved(); await settled(2);
  assert.equal(await sticker().count(), 0);
  const offers = await (await context.request.get(origin + "/api/offers")).json();
  assert.equal(offers.coupon.offerId, id(180), "the server really has a second eligible candidate");
  const cart = await (await context.request.get(origin + "/api/cart")).json();
  assert.equal(cart.cart.find((line: { productId: string }) => line.productId === PRODUCT.basil).discount, 49);
  assert.equal((await fixture.db.query("select 1 from offer_events where offer_id=$1", [id(180)])).rows.length, 0);
  await screenshot("second-coupon-skipped-mobile.png");
  pass("claim keeps the DB discount but a losing draw hides the next eligible coupon and records no false impression");

  await roll(0.1); await page.reload(); await ready(); await settled(2);
  await roll(0.1);
  assert.equal(await sticker().count(), 0); await poll(); assert.equal(await sticker().count(), 0);
  pass("reload and the minute refresh preserve a missed draw even after the random source would win");

  await scan(); await settled(3); await sticker().waitFor();
  assert.match((await sticker().getAttribute("aria-label"))!, /トマトパスタソース/);
  await roll(0.99); await page.reload(); await ready(); await settled(3); await sticker().waitFor();
  await screenshot("later-coupon-mobile.png");
  pass("the next saved cart version can win; reload preserves the winning draw with random=0.99");

  await sticker().click(); await page.getByRole("dialog").getByRole("button", { name: "閉じる", exact: true }).click();
  await roll(0.1); await poll(); assert.equal(await sticker().count(), 0);
  pass("opening consumes the sticker; closing and refreshing never immediately produce another sticker");

  await page.getByRole("button", { name: "店舗・来店を選ぶ", exact: true }).click();
  page.once("dialog", d => { void d.accept(); });
  await page.getByRole("button", { name: "空のかごで新しく来店する", exact: true }).first().click(); await ready();
  await roll(0.99); await scan(); await sticker().waitFor();
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await roll(null);
  await login(4); await roll(0.99); await scan(); await sticker().waitFor();
  pass("new visits and other customers get their own guaranteed first coupon");

  await page.evaluate(() => {
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("kago-coupon-appearance:")) throw new DOMException("Test storage rejection", "QuotaExceededError");
      save.call(this, key, value);
    };
  });
  const changed = page.waitForResponse(r => r.url().endsWith("/api/offers") && r.request().method() === "GET");
  await scan(); await changed; await sticker().waitFor({ state: "hidden" });
  await roll(0.1); await poll(); assert.equal(await sticker().count(), 0);
  pass("unavailable session storage still preserves the current draw in memory during cart and timer refreshes");
  assert.equal(errors.length, 0, errors.join("\n"));
  await writeFile(resolve(output, "result.json"), JSON.stringify({ passed }, null, 2));
} catch (error) {
  await active?.screenshot({ path: resolve(output, "failure.png") }).catch(() => {});
  if (active) await writeFile(resolve(output, "failure.txt"), (await active.locator("body").innerText()) + "\n" + log);
  throw error;
} finally { await browser?.close(); server.kill(); await fixture.close(); }
