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
  const addCode = async(code:string) => {
    await page.getByRole("textbox",{name:"商品名・商品コードで検索",exact:true}).fill("");
    await page.getByRole("button",{name:"検索",exact:true}).click();
    const panel=page.getByRole("dialog",{name:"商品を探す",exact:true});
    await panel.locator(".shopping-code summary").click();
    await panel.getByLabel("商品コードを入力",{exact:true}).fill(code);
    await panel.getByRole("button",{name:"コードで追加",exact:true}).click();
    await page.getByText("かごを保存しました。",{exact:true}).waitFor();
    await panel.getByRole("button",{name:"閉じる",exact:true}).click();
  };
  const scan=async()=>{await addCode("2900000000100");await sticker().waitFor();};
  const reload = async () => {
    const offers = page.waitForResponse(r => r.url().endsWith("/api/offers") && r.request().method() === "GET");
    await page.reload(); await ready(); await offers;
    await page.getByTestId("shopping-home").waitFor();
  };
  const newVisit = async () => {
    await page.getByRole("link",{name:"マイページ",exact:true}).click();
    await page.getByRole("button", { name: "店舗・来店を選ぶ", exact: true }).click();
    await page.locator(".store-entry-extra summary").click();
    page.once("dialog", d => { void d.accept(); });
    await page.getByRole("button", { name: "空のかごで新しく来店する", exact: true }).first().click();
    await page.getByRole("heading",{name:"マイページ",exact:true}).waitFor();await page.getByRole("link",{name:"ホーム",exact:true}).click();await ready(); await scan();
  };
  const eventCount = async (type: string, user = 3) => (await fixture.db.query<{ n: number }>(
    "select count(*)::int n from offer_events where offer_id=$1 and user_id=$2 and event_type=$3", [OFFER.coupon, id(user), type])).rows[0].n;
  await page.goto(origin + "/App");
  await page.getByLabel("メールアドレス").fill("user3@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("button", { name: "前回の店舗から再開", exact: true }).first().click();
  await ready(); await scan();
  await page.screenshot({ path: resolve(output, "before-open-mobile.png") });
  await sticker().click(); await dialog().waitFor();
  assert.equal(await sticker().count(), 0);
  await page.screenshot({ path: resolve(output, "detail-mobile.png") });
  await dialog().getByRole("button", { name: "閉じる", exact: true }).click();
  // #166: closing the details returns to the ticket; only using or「今回は見送る」removes it.
  await dialog().waitFor({ state: "hidden" }); await sticker().waitFor(); assert.equal(await sticker().count(), 1);
  await page.screenshot({ path: resolve(output, "after-close-mobile.png") });
  await reload(); await sticker().waitFor(); assert.equal(await sticker().count(), 1);
  assert.equal(await eventCount("offer_opened"), 1); assert.equal(await eventCount("offer_dismissed"), 0);
  pass("coupon-only details open; closing with X returns to the ticket (also after reload) without a dismissal event");

  const refreshed = page.waitForResponse(r => r.url().endsWith("/api/offers") && r.request().method() === "GET");
  await addCode("4900000000016");
  await page.getByText("かごを保存しました。", { exact: true }).waitFor();
  // The server re-chooses the coupon from the latest added product (DEMO-02), so the ticket follows its answer.
  const offered = (await (await refreshed).json()).coupon;
  if (offered) await sticker().waitFor(); else await page.waitForTimeout(500);
  assert.equal(await sticker().count(), offered ? 1 : 0);
  pass("after a saved cart update the ticket follows the server's coupon for the latest product (opening never hides it)");

  await newVisit(); await sticker().click(); await dialog().waitFor();
  await page.keyboard.press("Escape"); await dialog().waitFor({ state: "hidden" });
  await sticker().waitFor(); assert.equal(await sticker().count(), 1); await reload(); await sticker().waitFor(); assert.equal(await sticker().count(), 1);
  pass("a new visit shows the coupon again; Escape also returns to the ticket");

  await newVisit(); await sticker().click(); await dialog().waitFor();
  await page.getByRole("button", { name: "クーポンを閉じる", exact: true }).click({ position: { x: 10, y: 10 } });
  await dialog().waitFor({ state: "hidden" }); await sticker().waitFor(); assert.equal(await sticker().count(), 1);
  pass("closing by tapping the backdrop also returns to the ticket");

  await newVisit(); await sticker().click(); await dialog().waitFor();
  await dialog().getByRole("button",{name:"クーポンを受け取る",exact:true}).click();
  await page.getByLabel("クーポン対象の商品コードを入力", { exact: true }).fill("2900000000179");
  await page.getByRole("button", { name: "商品を確認", exact: true }).click();
  await page.getByText("対象商品を確認しました：生バジル", { exact: true }).waitFor();
  await page.getByRole("button", { name: "この商品にクーポンを使う", exact: true }).click();
  await page.getByText("かごを保存しました。", { exact: true }).waitFor();
  const snapshot = await (await context.request.get(origin + "/api/cart")).json();
  assert.equal(snapshot.cart.find((l: { productId: string }) => l.productId === PRODUCT.basil).discount, 49);
  await reload(); assert.equal(await sticker().count(), 0);
  pass("opening consumes only the sticker: adding from details still saves the DB discount");

  await page.getByRole("link",{name:"マイページ",exact:true}).click();
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await page.getByLabel("メールアドレス").fill("user4@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("button", { name: "前回の店舗から再開", exact: true }).first().click();
  await page.getByRole("heading",{name:"マイページ",exact:true}).waitFor();await page.getByRole("link",{name:"ホーム",exact:true}).click();
  await ready(); await scan(); await sticker().click(); await dialog().waitFor();
  await page.getByRole("button", { name: "今回は見送る", exact: true }).click();
  await reload(); assert.equal(await sticker().count(), 0);
  assert.equal(await eventCount("offer_dismissed", 4), 1);
  assert.equal(await eventCount("offer_dismissed"), 0);
  pass("another customer in the same tab can open their coupon; explicit dismissal remains recorded separately");

  // #166: the "opened" list is no longer stored (opening does not consume the ticket), so its storage-failure check was removed.
  assert.equal(errors.length, 0, errors.join("\n"));
  await writeFile(resolve(output, "result.json"), JSON.stringify({ passed }, null, 2));
} finally { await browser?.close(); server.kill(); await fixture.close(); }
