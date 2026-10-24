// #142: A coupon sticker is consumed by opening, independently of claim/dismiss events.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";
import { OFFER, PRODUCT } from "./fixtures/offers.mts";

const fixture = await createCartBackend({ offers: true });
// Exercise the early-return boundary: the coupon must still open with no other deals.
await fixture.db.query("update store_offers set status='inactive' where kind <> 'guerrilla_coupon'");
const origin = "http://127.0.0.1:3121", output = resolve("../../internal/coupon-once-evidence");
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3121"], {
  env: { ...process.env, KAGO_NEXT_DIST_DIR: ".next/coupon-once-e2e", KAGO_DEMO_ENABLED: "0", NEXT_PUBLIC_SUPABASE_URL: fixture.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" },
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let log = ""; server.stdout.on("data", c => { log += c; }); server.stderr.on("data", c => { log += c; });
let browser;
const passed: string[] = [], pass = (s: string) => { passed.push(s); console.log("PASS: " + s); };
try {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw Error(log);
    try { if ((await fetch(origin + "/api/shopping")).status === 401) break; } catch { /* starting */ }
    if (i === 59) throw Error(log);
    await delay(1000);
  }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const sticker = () => page.getByRole("button", { name: /^ゲリラクーポン：/ });
  const dialog = () => page.getByRole("dialog", { name: "生バジル 25% OFF", exact: true });
  const ready = () => page.getByText("かごを最新の状態にしました。", { exact: true }).waitFor();
  const scan = async () => {
    await page.getByLabel("商品コードを入力", { exact: true }).fill("2900000000100");
    await page.getByRole("button", { name: "コードで追加", exact: true }).click();
    await page.getByText("かごを保存しました。", { exact: true }).waitFor();
    await sticker().waitFor();
  };
  const reload = async () => {
    const offers = page.waitForResponse(r => r.url().endsWith("/api/offers") && r.request().method() === "GET");
    await page.reload(); await ready(); await offers;
    await page.getByRole("heading", { name: "商品から選ぶ", exact: true }).waitFor();
  };
  const newVisit = async () => {
    await page.getByRole("button", { name: "店舗・来店を選ぶ", exact: true }).click();
    page.once("dialog", d => { void d.accept(); });
    await page.getByRole("button", { name: "空のかごで新しく来店する", exact: true }).first().click();
    await ready(); await scan();
  };
  const eventCount = async (type: string, user = 3) => (await fixture.db.query<{ n: number }>(
    "select count(*)::int n from offer_events where offer_id=$1 and user_id=$2 and event_type=$3", [OFFER.coupon, id(user), type])).rows[0].n;
  await page.goto(origin + "/App");
  await page.getByLabel("メールアドレス").fill("user3@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("button", { name: "続きから開く", exact: true }).first().click();
  await ready(); await scan();
  await page.screenshot({ path: resolve(output, "before-open-mobile.png") });
  await sticker().click(); await dialog().waitFor();
  assert.equal(await sticker().count(), 0);
  await page.screenshot({ path: resolve(output, "detail-mobile.png") });
  await dialog().getByRole("button", { name: "閉じる", exact: true }).click();
  await dialog().waitFor({ state: "hidden" }); assert.equal(await sticker().count(), 0);
  await page.screenshot({ path: resolve(output, "after-close-mobile.png") });
  await reload(); assert.equal(await sticker().count(), 0);
  assert.equal(await eventCount("offer_opened"), 1); assert.equal(await eventCount("offer_dismissed"), 0);
  pass("coupon-only details open; closing with X and reloading keep the sticker hidden without a dismissal event");

  const refreshed = page.waitForResponse(r => r.url().endsWith("/api/offers") && r.request().method() === "GET");
  await page.getByRole("button", { name: "検証ミルクをかごに追加", exact: true }).click();
  await page.getByText("かごを保存しました。", { exact: true }).waitFor(); await refreshed;
  assert.equal(await sticker().count(), 0);
  pass("a saved cart update does not restore the opened sticker");

  await newVisit(); await sticker().click(); await dialog().waitFor();
  await page.keyboard.press("Escape"); await dialog().waitFor({ state: "hidden" });
  assert.equal(await sticker().count(), 0); await reload(); assert.equal(await sticker().count(), 0);
  pass("a new visit shows the coupon again; Escape consumes it for that visit");

  await newVisit(); await sticker().click(); await dialog().waitFor();
  await page.getByRole("button", { name: "クーポンを閉じる", exact: true }).click({ position: { x: 10, y: 10 } });
  await dialog().waitFor({ state: "hidden" }); assert.equal(await sticker().count(), 0);
  pass("closing by tapping the backdrop also leaves the sticker hidden");

  await newVisit(); await sticker().click(); await dialog().waitFor();
  await page.getByRole("button", { name: "割引付きでかごに追加", exact: true }).click();
  await page.getByText("かごを保存しました。", { exact: true }).waitFor();
  const snapshot = await (await context.request.get(origin + "/api/cart")).json();
  assert.equal(snapshot.cart.find((l: { productId: string }) => l.productId === PRODUCT.basil).discount, 49);
  await reload(); assert.equal(await sticker().count(), 0);
  pass("opening consumes only the sticker: adding from details still saves the DB discount");

  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await page.getByLabel("メールアドレス").fill("user4@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("button", { name: "続きから開く", exact: true }).first().click();
  await ready(); await scan(); await sticker().click(); await dialog().waitFor();
  await page.getByRole("button", { name: "今回は見送る", exact: true }).click();
  await reload(); assert.equal(await sticker().count(), 0);
  assert.equal(await eventCount("offer_dismissed", 4), 1);
  assert.equal(await eventCount("offer_dismissed"), 0);
  pass("another customer in the same tab can open their coupon; explicit dismissal remains recorded separately");

  await page.evaluate(() => {
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("kago-offers-opened:")) throw new DOMException("Test storage rejection", "QuotaExceededError");
      save.call(this, key, value);
    };
  });
  await newVisit(); await sticker().click(); await dialog().waitFor();
  await dialog().getByRole("button", { name: "閉じる", exact: true }).click();
  const storageRefresh = page.waitForResponse(r => r.url().endsWith("/api/offers") && r.request().method() === "GET");
  await page.getByRole("button", { name: "検証ミルクをかごに追加", exact: true }).click();
  await page.getByText("かごを保存しました。", { exact: true }).waitFor(); await storageRefresh;
  assert.equal(await sticker().count(), 0);
  pass("if saving the display preference fails, a cart refresh still preserves the in-memory choice");
  assert.equal(errors.length, 0, errors.join("\n"));
  await writeFile(resolve(output, "result.json"), JSON.stringify({ passed }, null, 2));
} finally { await browser?.close(); server.kill(); await fixture.close(); }
