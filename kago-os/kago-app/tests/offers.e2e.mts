// APP-13 browser check: actual Next API/UI + official SQL/RLS via PGlite. Auth/PostgREST use a local adapter.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { chromium, type Page } from "playwright";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";
import { OFFER, PRODUCT } from "./fixtures/offers.mts";
import type { CartSnapshot } from "../src/features/cart/contracts.ts";

const fixture = await createCartBackend({ offers: true });
const origin = "http://127.0.0.1:3110";
const output = resolve("../../internal/app13-evidence"); await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3110"], {
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: fixture.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let log = ""; server.stdout.on("data", c => { log += c; }); server.stderr.on("data", c => { log += c; });
let browser; let active: Page | undefined; const passed: string[] = []; const pass = (s: string) => { passed.push(s); console.log("PASS: " + s); };
type Snapshot = CartSnapshot & { discountTotal: number };
try {
  for (let i = 0; i < 90; i++) { if (server.exitCode !== null) throw Error(log); try { if ((await fetch(origin + "/api/shopping")).status === 401) break; } catch { /* starting */ } if (i === 89) throw Error(log); await delay(1000); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const a = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await a.newPage(); active = page; page.setDefaultTimeout(45000);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const wait = (text: string | RegExp, p = page) => p.getByText(text, typeof text === "string" ? { exact: true } : undefined).first().waitFor();
  const saved = (p = page) => wait("かごを保存しました。", p);
  const login = async (p: Page, n = 3) => {
    await p.goto(origin + "/App"); await p.getByLabel("メールアドレス").fill(`user${n}@example.test`); await p.getByLabel("パスワード", { exact: true }).fill("fixture-password");
    await p.getByRole("button", { name: "ログイン", exact: true }).click(); await p.getByRole("button", { name: "続きから開く", exact: true }).first().click();
    await wait("かごを最新の状態にしました。", p);
  };
  const scan = async (code: string, p = page) => { await p.getByLabel("商品コードを入力").fill(code); await p.getByRole("button", { name: "コードで追加", exact: true }).click(); await saved(p); };
  const snapshot = async (context = a) => { const r = await context.request.get(origin + "/api/cart"); assert.equal(r.status(), 200); return await r.json() as Snapshot; };
  const line = (s: Snapshot, product: string) => s.cart.find(l => l.productId === product);
  const sticker = (p = page) => p.getByRole("button", { name: /^ゲリラクーポン：/ });

  assert.equal((await a.request.get(origin + "/api/offers")).status(), 401);
  await login(page);
  await page.getByRole("article", { name: /タイムセール お惣菜 20%OFF/ }).waitFor();
  await wait(/タイムセール開始！ \d\d:\d\d〜\d\d:\d\d/);
  await delay(800); assert.equal(await sticker().count(), 0, "no coupon before a related product is scanned");
  pass("store time sale is shown with JST times; no coupon appears before a trigger product");

  await scan("2900000000100");
  await sticker().waitFor(); assert.match((await sticker().getAttribute("aria-label"))!, /生バジル 25% OFF/);
  await page.getByRole("article", { name: /セット割/ }).waitFor();
  await page.screenshot({ path: resolve(output, "offers-mobile.png"), fullPage: false });
  pass("scanning pasta surfaces the basil guerrilla coupon sticker and the pasta + sauce set deal");

  await sticker().click(); await page.getByRole("dialog", { name: "生バジル 25% OFF" }).waitFor();
  await wait("スパゲッティの仕上げに合います（KAGOが登録した組み合わせ）。25%OFFでお得なため選ばれました。"); await wait("￥149");
  await page.screenshot({ path: resolve(output, "coupon-dialog-mobile.png"), fullPage: false });
  await page.getByLabel("クーポン対象の商品コードを入力", { exact: true }).fill("2900000000179");
  await page.getByRole("button", { name: "商品を確認", exact: true }).click();
  await wait("対象商品を確認しました：生バジル");
  await page.getByRole("button", { name: "割引付きでかごに追加", exact: true }).click(); await saved();
  let s = await snapshot(); assert.equal(line(s, PRODUCT.basil)!.discount, 49); assert.equal(s.discountTotal, 49);
  await delay(800); assert.equal(await sticker().count(), 0, "a claimed coupon is not shown again");
  const events = (await fixture.db.query<{ event_type: string }>("select event_type from offer_events where offer_id=$1 order by occurred_at", [OFFER.coupon])).rows.map(r => r.event_type);
  assert(events.includes("offer_shown") && events.includes("offer_opened"));
  const added = (await fixture.db.query<{ payload: { offer_id: string } }>("select payload from events where event_type='cart_item_added' and product_id=$1 and visit_id=$2", [PRODUCT.basil, id(13)])).rows;
  assert.equal(added[0].payload.offer_id, OFFER.coupon);
  pass("tapping the sticker adds basil with the DB discount; shown → opened → cart_item_added(offer_id) are linked");

  await page.getByRole("button", { name: "セットでかごに追加（トマトパスタソースを追加）", exact: true }).click(); await saved();
  s = await snapshot(); assert.equal(line(s, PRODUCT.sauce)!.discount, 29); assert.equal(line(s, PRODUCT.pasta)!.discount, 24);
  await page.getByRole("button", { name: "セール価格でかごに追加", exact: true }).click(); await saved();
  s = await snapshot(); assert.equal(line(s, PRODUCT.karaage)!.discount, 43); assert.equal(s.discountTotal, 49 + 29 + 24 + 43);
  pass("set deal adds the missing sauce and discounts both; time sale adds karaage at the sale price");

  await page.getByRole("button", { name: /買い物かごを開く/ }).click();
  await wait("クーポン・セール割引"); await wait(`−￥${49 + 29 + 24 + 43}`);
  const expected = 248 + 198 + 298 + 218 - (49 + 29 + 24 + 43);
  await wait(`￥${expected.toLocaleString("ja-JP")}`);
  await page.screenshot({ path: resolve(output, "cart-discount-mobile.png"), fullPage: false });
  await page.getByRole("button", { name: "トマトパスタソースを削除", exact: true }).click(); await saved();
  s = await snapshot(); assert.equal(line(s, PRODUCT.pasta)!.discount, 0); assert.equal(s.discountTotal, 49 + 43);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  pass("cart shows subtotal/discount/total from the DB; removing the sauce cancels the set discount");

  await page.reload(); await wait("かごを最新の状態にしました。");
  assert.equal((await snapshot()).discountTotal, 49 + 43);
  await delay(1500); assert.equal(await page.getByRole("article", { name: /セット割/ }).count(), 0); assert.equal(await sticker().count(), 0);
  const final = await snapshot(); const total = final.cart.reduce((n, l) => n + l.price * l.quantity, 0) - final.discountTotal;
  const order = await fixture.rpc("kago_checkout", [id(13), randomUUID(), final.visit.cart_version, total]) as { total: number };
  assert.equal(order.total, 248 + 198 + 218 - 49 - 43);
  pass("after reload the discounts persist, claimed offers stay hidden, and checkout charges the displayed total");

  const b = await browser.newContext({ viewport: { width: 390, height: 844 } }); const other = await b.newPage(); other.on("pageerror", e => errors.push(e.message));
  await login(other, 4); await scan("2900000000100", other);
  await sticker(other).click(); await other.getByRole("button", { name: "今回は見送る", exact: true }).click();
  await other.reload(); await wait("かごを最新の状態にしました。", other); await delay(1500);
  assert.equal(await sticker(other).count(), 0);
  assert.equal((await fixture.db.query("select 1 from offer_events where event_type='offer_dismissed' and user_id=$1", [id(4)])).rows.length, 1);
  pass("a dismissed coupon stays hidden for that visit after reload and the dismissal is recorded");

  await fixture.db.query("update store_offers set status='inactive' where id=$1", [OFFER.timeSale]);
  const before = (await snapshot(b)).visit.cart_version;
  await other.getByRole("button", { name: "セール価格でかごに追加", exact: true }).click();
  await wait("このお得情報は終了したか、いまは利用できません。", other);
  assert.equal((await snapshot(b)).visit.cart_version, before); assert.equal(line(await snapshot(b), PRODUCT.karaage), undefined);
  await other.getByRole("button", { name: "かごを再読み込み", exact: true }).click(); await wait("かごを最新の状態にしました。", other);
  await delay(1500); assert.equal(await other.getByRole("article", { name: /タイムセール/ }).count(), 0);
  pass("a stopped offer is refused by the DB without changing the cart, and disappears from the App");

  await fixture.db.query(`insert into store_offers(store_id,kind,product_id,discount_percent,headline,starts_at,ends_at)
    values ($1,'time_sale',$2,30,'牛乳 夕方セール',clock_timestamp()+interval '6 seconds',clock_timestamp()+interval '1 hour')`, [id(1), id(20)]);
  await other.reload(); await wait("かごを最新の状態にしました。", other);
  assert.equal(await other.getByRole("article", { name: /牛乳 夕方セール/ }).count(), 0);
  await other.getByRole("article", { name: /牛乳 夕方セール/ }).waitFor({ timeout: 20000 });
  pass("a time sale appears automatically at its start time without reloading");

  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(`${passed.length} offer browser/SQL scenarios passed.`);
  await writeFile(resolve(output, "result.json"), JSON.stringify({ passed }, null, 2));
} catch (error) {
  if (active) { await active.screenshot({ path: resolve(output, "failure.png"), fullPage: true }); console.log((await active.locator("body").innerText()).slice(0, 2500)); }
  throw error;
} finally { await browser?.close(); server.kill(); await fixture.close(); }
