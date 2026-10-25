// #186: scanning spaghetti always shows the tomato sauce coupon, and a guerrilla coupon is confirmed by scanning only
// (no code entry), unless the camera cannot be used. Real Next/API + official SQL/RLS (PGlite).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";
import { PRODUCT } from "./fixtures/offers.mts";

const fixture = await createCartBackend({ offers: true });
// Like the demo store: a tomato sauce coupon with no trigger product, next to the fixture's basil coupon (25%, higher score).
await fixture.db.query(`insert into store_offers(id,store_id,kind,product_id,trigger_product_id,discount_percent,headline,starts_at,ends_at)
  values ($1,$2,'guerrilla_coupon',$3,null,15,'トマトパスタソース 15% OFF',now()-interval '1 hour',now()+interval '1 day')`,
  [id(185), id(1), PRODUCT.sauce]);
const sauceCode = (await fixture.db.query<{ code: string }>("select code from products where id=$1", [PRODUCT.sauce])).rows[0].code;
const origin = "http://127.0.0.1:3127";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3127"], {
  // NEXT_PUBLIC_KAGO_COUPON_CODE_ENTRY is not set: the default demo behaviour.
  env: { ...process.env, KAGO_NEXT_DIST_DIR: ".next/coupon-scan-only-e2e", KAGO_DEMO_ENABLED: "0", NEXT_PUBLIC_KAGO_COUPON_CODE_ENTRY: "",
    NEXT_PUBLIC_SUPABASE_URL: fixture.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" },
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let log = ""; server.stdout.on("data", c => { log += c; }); server.stderr.on("data", c => { log += c; });
let browser;
const passed: string[] = [], pass = (s: string) => { passed.push(s); console.log("PASS: " + s); };
try {
  for (let i = 0; i < 90; i++) {
    if (server.exitCode !== null) throw Error(log);
    try { if ((await fetch(origin + "/api/shopping")).status === 401) break; } catch { /* starting */ }
    if (i === 89) throw Error(log); await delay(1000);
  }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const saved = () => page.getByText("かごを保存しました。", { exact: true }).waitFor();
  const ready = () => page.getByText("かごを最新の状態にしました。", { exact: true }).waitFor();
  const sticker = () => page.getByRole("button", { name: /^ゲリラクーポン：/ });

  await page.goto(origin + "/App");
  await page.getByLabel("メールアドレス").fill("user3@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("button", { name: /前回の店舗から再開|この店舗で買い物を始める/ }).first().click();
  const myPage = page.getByRole("heading", { name: "マイページ", exact: true });
  await Promise.race([ready(), myPage.waitFor()]);
  if (await myPage.isVisible()) { await page.getByRole("link", { name: "ホーム", exact: true }).click(); await ready(); }

  await page.getByRole("button", { name: "検索", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "商品を探す", exact: true });
  await panel.locator(".shopping-code summary").click();
  await panel.getByLabel("商品コードを入力", { exact: true }).fill("2900000000100");
  await panel.getByRole("button", { name: "コードで追加", exact: true }).click(); await saved();
  await panel.getByRole("button", { name: "閉じる", exact: true }).click();
  await sticker().waitFor();
  const offers = await (await context.request.get(origin + "/api/offers")).json();
  assert.equal(offers.coupon.product.code, sauceCode, "spaghetti → tomato sauce, although the basil coupon scores higher");
  pass("scanning spaghetti shows the tomato sauce coupon (fixed for the demo)");

  await sticker().click();
  const dialog = page.getByRole("dialog", { name: "トマトパスタソース 15% OFF", exact: true });
  await dialog.getByRole("button", { name: "クーポンを受け取る", exact: true }).click();
  await dialog.getByText("商品のバーコードを読み取ってください。確認だけではかごに追加されません。", { exact: true }).waitFor();
  assert.equal(await dialog.getByLabel("クーポン対象の商品コードを入力", { exact: true }).count(), 0);
  assert.equal(await dialog.getByRole("button", { name: "商品を確認", exact: true }).count(), 0);
  pass("the coupon dialog has no code entry; it asks to scan the barcode");

  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Test denied", "NotAllowedError"); }; });
  await dialog.getByRole("button", { name: "カメラで読み取る", exact: true }).click();
  await dialog.getByLabel("クーポン対象の商品コードを入力", { exact: true }).fill(sauceCode);
  await dialog.getByRole("button", { name: "商品を確認", exact: true }).click();
  await page.getByText("対象商品を確認しました：トマトパスタソース", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "この商品にクーポンを使う", exact: true }).click(); await saved();
  const cart = await (await context.request.get(origin + "/api/cart")).json();
  assert.ok(cart.cart.find((line: { productId: string; discount: number }) => line.productId === PRODUCT.sauce)?.discount > 0);
  pass("when the camera cannot be used, the code entry appears so the coupon can still be used");

  assert.deepEqual(errors, []);
  console.log(`${passed.length} scan-only coupon scenarios passed.`);
} finally { await browser?.close(); server.kill(); await fixture.close(); }
