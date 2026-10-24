// #144 browser check: 「商品から選ぶ」 genre → products. Actual Next API/UI + official SQL/RLS via PGlite.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Page } from "playwright";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";

const fixture = await createCartBackend();
// Store 1: meat, fish, a drink (not in the menu) and many vegetables (more than one API page).
await fixture.db.exec(`insert into products(id,code,name,category) values
  ('${id(800)}','PLU-5004','鶏もも肉 300g','肉'),('${id(801)}','PLU-6001','生鮭 切身 2切','魚'),('${id(802)}','DRINK-1','検証ジュース','飲料');
  insert into store_products(store_id,product_id,price,is_active) values ('${id(1)}','${id(800)}',378,true),('${id(1)}','${id(801)}',398,true),('${id(1)}','${id(802)}',120,true);`);
for (let n = 0; n < 55; n++) {
  await fixture.db.query("insert into products(id,code,name,category) values ($1,$2,$3,'野菜')", [id(900 + n), `VEG-${n}`, `検証やさい${String(n).padStart(2, "0")}`]);
  await fixture.db.query("insert into store_products(store_id,product_id,price,is_active) values ($1,$2,100,true)", [id(1), id(900 + n)]);
}
const origin = "http://127.0.0.1:3112";
const output = resolve("../../internal/menu-evidence"); await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3112"], {
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: fixture.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let log = ""; server.stdout.on("data", c => { log += c; }); server.stderr.on("data", c => { log += c; });
let browser; let active: Page | undefined; const passed: string[] = []; const pass = (s: string) => { passed.push(s); console.log("PASS: " + s); };
try {
  for (let i = 0; i < 90; i++) { if (server.exitCode !== null) throw Error(log); try { if ((await fetch(origin + "/api/shopping")).status === 401) break; } catch { /* starting */ } if (i === 89) throw Error(log); await delay(1000); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage(); active = page; page.setDefaultTimeout(45000);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const add = (name: string) => page.getByRole("button", { name: `${name}をかごに追加`, exact: true });
  const genre = (label: string) => page.getByRole("group", { name: "ジャンル" }).getByRole("button", { name: new RegExp(label) });
  await page.goto(origin + "/App"); await page.getByLabel("メールアドレス").fill("user3@example.test"); await page.getByLabel("パスワード", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click(); await page.getByRole("button", { name: "続きから開く", exact: true }).first().click();
  await add("検証ミルク").waitFor();

  assert.deepEqual((await page.getByRole("group", { name: "ジャンル" }).getByRole("button").allInnerTexts()).map(t => t.replace(/\s+/g, "")), ["🥬野菜", "🥩肉", "🐟魚"]);
  assert.equal(await genre("野菜").getAttribute("aria-pressed"), "true");
  await add("検証やさい54").waitFor(); // beyond the first 50 products: every page is read
  assert.equal(await add("鶏もも肉 300g").count(), 0); assert.equal(await add("検証ジュース").count(), 0);
  await page.locator("#manual-products").screenshot({ path: resolve(output, "menu-vegetables-375.png") });
  pass("vegetables are shown first in a 3-column grid; meat/fish/other products are not mixed in; all pages are read");

  await genre("肉").click();
  assert.equal(await genre("肉").getAttribute("aria-pressed"), "true");
  await add("鶏もも肉 300g").waitFor(); assert.equal(await add("検証ミルク").count(), 0);
  await add("鶏もも肉 300g").click(); await page.getByText("かごを保存しました。", { exact: true }).first().waitFor();
  await genre("魚").click(); await add("生鮭 切身 2切").waitFor(); assert.equal(await add("鶏もも肉 300g").count(), 0);
  await page.locator("#manual-products").screenshot({ path: resolve(output, "menu-fish-375.png") });
  pass("tapping 肉/魚 switches the products; adding from a genre saves to the cart");

  const width = await page.evaluate(() => document.documentElement.scrollWidth); assert.ok(width <= 375, `no horizontal scroll (${width})`);
  const columns = await page.locator("#manual-products article").evaluateAll(cards => new Set(cards.slice(0, 3).map(c => Math.round(c.getBoundingClientRect().top))).size);
  assert.equal(columns, 1, "the first three cards are on one row");
  pass("3 per row at 375px without horizontal scroll");

  await page.getByLabel("商品名・商品コードで検索", { exact: true }).fill("検証"); await page.getByRole("button", { name: "検索", exact: true }).click();
  await page.getByText("「検証」の検索結果", { exact: true }).waitFor();
  await add("検証ミルク").waitFor(); assert.equal(await add("検証ジュース").count(), 0, "search stays within the menu genres");
  await page.getByRole("button", { name: "ジャンルに戻る", exact: true }).click(); await genre("野菜").waitFor();
  pass("search covers the three genres only; ジャンルに戻る returns to the genre view");

  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(`${passed.length} menu browser scenarios passed.`);
} catch (error) {
  if (active) { await active.screenshot({ path: resolve(output, "failure.png"), fullPage: true }); console.log((await active.locator("body").innerText()).slice(0, 2000)); }
  throw error;
} finally { await browser?.close(); server.kill(); await fixture.close(); }
