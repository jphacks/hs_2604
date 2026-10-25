// #142: coupon-only scan/code confirmation; reads never add, explicit claims retain retries.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Route } from "playwright";
import sharp from "sharp";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { OFFER, PRODUCT } from "./fixtures/offers.mts";
import type { CartSnapshot } from "../src/features/cart/contracts.ts";

const fixture = await createCartBackend({ offers: true });
const origin = "http://127.0.0.1:3122", output = resolve("../../internal/coupon-redemption-evidence");
await mkdir(output, { recursive: true });
// Use the generated SVG itself as a camera frame, exercising the real ZXing decoder.
const barcode = await sharp(await readFile("public/demo/barcodes/2900000000179.svg")).resize({ width: 700 }).png().toBuffer();
const grey = await sharp({ create: { width: 1280, height: 720, channels: 3, background: "white" } })
  .composite([{ input: barcode, gravity: "centre" }]).greyscale().raw().toBuffer();
const frame = Buffer.concat([Buffer.from("FRAME\n"), grey, Buffer.alloc(1280 * 720 / 2, 128)]);
const video = resolve(output, "basil.y4m");
await writeFile(video, Buffer.concat([Buffer.from("YUV4MPEG2 W1280 H720 F10:1 Ip A1:1 C420jpeg\n"), ...Array.from({ length: 20 }, () => frame)]));
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3122"], {
  env: { ...process.env, KAGO_NEXT_DIST_DIR: ".next/coupon-redemption-e2e", KAGO_DEMO_ENABLED: "0", NEXT_PUBLIC_SUPABASE_URL: fixture.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", NEXT_PUBLIC_KAGO_COUPON_CODE_ENTRY: "1" },
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
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${video}`] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const snapshot = async () => await (await context.request.get(origin + "/api/cart")).json() as CartSnapshot;
  const dialog = () => page.getByRole("dialog", { name: "生バジル 25% OFF", exact: true });
  const input = () => dialog().getByLabel("クーポン対象の商品コードを入力", { exact: true });
  const confirm = () => dialog().getByRole("button", { name: "商品を確認", exact: true });
  const add = () => dialog().getByRole("button", { name: "割引付きでかごに追加", exact: true });
  const verified = () => page.getByText("対象商品を確認しました：生バジル", { exact: true }).waitFor();
  const ready = () => page.getByText("かごを最新の状態にしました。", { exact: true }).waitFor();
  const saved = () => page.getByText("かごを保存しました。", { exact: true }).waitFor();
  const openCoupon = async () => {
    await page.getByRole("button", { name: /^ゲリラクーポン：/ }).click(); await dialog().waitFor();
  };
  const scanPasta = async () => {
    await page.getByLabel("商品コードを入力", { exact: true }).fill("2900000000100");
    await page.getByRole("button", { name: "コードで追加", exact: true }).click(); await saved();
  };
  const newVisit = async () => {
    await page.getByRole("button", { name: "店舗・来店を選ぶ", exact: true }).click();
    page.once("dialog", d => { void d.accept(); });
    await page.getByRole("button", { name: "空のかごで新しく来店する", exact: true }).first().click();
    await ready(); await scanPasta(); await openCoupon();
  };
  await page.goto(origin + "/App/demo-barcodes");
  await page.getByText("画像セルフチェック：17 / 17件 読み取り成功", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("メールアドレス").count(), 0);
  for (const name of ["スパゲッティ 500g", "新鮮たまご 10個", "トマトパスタソース", "生バジル"]) {
    await page.getByRole("article", { name, exact: true }).waitFor();
  }
  await page.screenshot({ path: resolve(output, "barcodes-mobile.png") });
  pass("all 17 generated barcodes decode to their exact codes; the printable page opens without login");

  await page.goto(origin + "/App"); await page.getByLabel("メールアドレス").fill("user3@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("button", { name: "続きから開く", exact: true }).first().click(); await ready();
  await scanPasta(); const before = await snapshot(); assert.equal(before.cart[0].productId, PRODUCT.pasta);
  await openCoupon(); assert(await add().isDisabled());
  await dialog().getByText("2900000000179", { exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, "scan-or-code-mobile.png") });
  await input().fill("4900000000016"); await confirm().click();
  await page.getByText("クーポン対象の商品ではありません。対象の商品を読み取るか、商品コードを確認してください。", { exact: true }).waitFor();
  await input().fill("unknown"); await confirm().click();
  await dialog().getByText("この店舗に登録されていない商品です。商品一覧から選ぶか、店員へお尋ねください。", { exact: true }).waitFor();
  assert(await add().isDisabled()); assert.deepEqual(await snapshot(), before);
  pass("coupon details display scan/code choices; unknown or different products cannot add or change the cart");

  const lookupKeys: string[] = []; let dropped = false;
  await page.route("**/api/cart", async route => {
    const body = route.request().method() === "POST" ? route.request().postDataJSON() : null;
    if (body?.action === "lookup" && body.code === "2900000000179") {
      lookupKeys.push(body.requestId);
      if (!dropped) { dropped = true; await route.abort("failed"); return; }
    }
    await route.continue();
  });
  await input().fill("2900000000179"); await confirm().click();
  await page.getByText("商品を確認できませんでした。通信状態を確認して、もう一度お試しください。", { exact: true }).waitFor();
  assert(await add().isDisabled()); await confirm().click(); await verified();
  assert.equal(lookupKeys.length, 2); assert.equal(lookupKeys[0], lookupKeys[1]);
  assert.deepEqual(await snapshot(), before); assert.equal(await add().isEnabled(), true);
  await page.screenshot({ path: resolve(output, "verified-mobile.png") });
  await dialog().getByRole("button", { name: "閉じる", exact: true }).click();
  assert.deepEqual(await snapshot(), before); await page.unroute("**/api/cart");
  pass("manual code verification retries the original lookup; checking or cancelling never adds the item");

  await newVisit(); const cameraBefore = await snapshot();
  await dialog().getByRole("button", { name: "カメラで読み取る", exact: true }).click(); await verified();
  assert.deepEqual(await snapshot(), cameraBefore);
  assert.equal(await page.locator("video").evaluateAll(videos => videos.some(v => ((v as HTMLVideoElement).srcObject as MediaStream | null)?.getTracks().some(t => t.readyState === "live"))), false);
  const claims: string[] = []; let lost = false;
  await page.route("**/api/cart", async route => {
    const body = route.request().method() === "POST" ? route.request().postDataJSON() : null;
    if (body?.action === "claim") {
      claims.push(body.claim?.requestId ?? body.requestId);
      if (!lost) { lost = true; await route.fetch(); await route.abort("failed"); return; }
    }
    await route.continue();
  });
  await add().click(); await page.getByText("通信が途切れました。保存結果を確認するため、同じ操作を再試行してください。", { exact: true }).waitFor();
  const committed = await snapshot(); assert.equal(committed.cart.find(l => l.productId === PRODUCT.basil)?.discount, 49);
  await page.reload();
  await page.getByRole("button", { name: "同じ操作を再試行", exact: true }).click(); await saved();
  assert.deepEqual(await snapshot(), committed); assert.equal(claims.length, 2); assert.equal(claims[0], claims[1]);
  await page.unroute("**/api/cart");
  pass("the generated basil barcode scans through ZXing without adding; explicit claim and lost-response retry save the discount once");

  await newVisit(); const cancelledBefore = await snapshot();
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let read!: () => void; const didRead = new Promise<void>(resolve => { read = resolve; });
  const held = async (route: Route) => {
    const body = route.request().method() === "POST" ? route.request().postDataJSON() : null;
    if (body?.action === "lookup" && body.code === "2900000000179") {
      const response = await route.fetch(); read(); await gate; await route.fulfill({ response });
    } else await route.continue();
  };
  await page.route("**/api/cart", held);
  await input().fill("2900000000179"); await confirm().click(); await didRead;
  await dialog().getByRole("button", { name: "閉じる", exact: true }).click(); release();
  await page.unrouteAll({ behavior: "wait" });
  assert.deepEqual(await snapshot(), cancelledBefore); assert.equal(await dialog().count(), 0);
  pass("closing during a delayed verification discards the response without any cart mutation");

  await newVisit();
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Test denied", "NotAllowedError"); }; });
  await dialog().getByRole("button", { name: "カメラで読み取る", exact: true }).click();
  await dialog().getByText("カメラの利用が許可されていません。ブラウザの設定から許可してください。", { exact: true }).waitFor();
  await input().fill("2900000000179"); await confirm().click(); await verified();
  await page.getByRole("button", { name: "別のコードを確認", exact: true }).click(); assert(await add().isDisabled());
  await page.setViewportSize({ width: 320, height: 740 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await input().fill("2900000000179"); await confirm().click(); await verified();
  pass("camera denial leaves manual code verification usable; rechecking clears confirmation and the dialog fits 320px");

  const expiredBefore = await snapshot();
  await fixture.db.query("update store_offers set status='inactive' where id=$1", [OFFER.coupon]);
  await add().click(); await page.getByText("このお得情報は終了したか、いまは利用できません。", { exact: true }).waitFor();
  assert.deepEqual(await snapshot(), expiredBefore);
  assert.equal(errors.length, 0, errors.join("\n"));
  pass("a coupon stopped after verification is rejected at claim without changing the cart");
  await writeFile(resolve(output, "result.json"), JSON.stringify({ passed }, null, 2));
} finally { await browser?.close(); server.kill(); await fixture.close(); }
