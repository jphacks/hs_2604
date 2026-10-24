// #148: execute the actual scenario seed and cart/discount RPCs through the Next UI.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";
import type { CartSnapshot } from "../src/features/cart/contracts.ts";

const fixture = await createCartBackend(), S1 = "0da7a001-0000-4000-8000-000000000001";
await fixture.db.query("insert into stores(id,slug,name) values ($1,'hiroshima-demo-store','広島デモ店')", [S1]);
const products: { code: string; name: string; category: string; price: number }[] = JSON.parse(await readFile("src/data/demo/products.json", "utf8"));
products.push({ code: "2900000000162", name: "トマトパスタソース", category: "調味料", price: 298 },
  { code: "PLU-2002", name: "若鶏の唐揚げ 100g", category: "惣菜", price: 218 });
for (const [n, p] of products.entries()) {
  await fixture.db.query("insert into products(id,code,name,category) values ($1,$2,$3,$4)", [id(700 + n), p.code, p.name, p.category]);
  await fixture.db.query("insert into store_products(store_id,product_id,price) values ($1,$2,$3)", [S1, id(700 + n), p.price]);
}
const source = await readFile("../kago-core/supabase/seed/app_offer_demo_scenarios.sql", "utf8");
await fixture.db.exec(source); await fixture.db.exec(source);
// An existing store offer may overlap with today's rehearsal; the App must not show duplicates.
await fixture.db.query(`insert into store_offers(store_id,kind,product_id,trigger_product_id,discount_percent,headline,starts_at,ends_at)
  select store_id,kind,product_id,trigger_product_id,discount_percent,'既存の施策',now()-interval '1 day',now()+interval '30 days'
  from store_offers where headline in ('デモ：パスタ＋ソース 10%OFF','デモ：牛乳タイムセール 20%OFF')`);
const origin = "http://127.0.0.1:3123", output = resolve("../../internal/offer-scenarios-evidence"); await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3123"], {
  env: { ...process.env, KAGO_NEXT_DIST_DIR: ".next/offer-scenarios-e2e", KAGO_DEMO_ENABLED: "0", NEXT_PUBLIC_SUPABASE_URL: fixture.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" },
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
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } }), page = await context.newPage(); page.setDefaultTimeout(30000);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const snapshot = async () => await (await context.request.get(origin + "/api/cart")).json() as CartSnapshot;
  const total = (s: CartSnapshot) => s.cart.reduce((n, l) => n + l.price * l.quantity, 0) - (s.discountTotal ?? 0);
  const saved = () => page.getByText("かごを保存しました。", { exact: true }).waitFor();
  const ready = () => page.getByText("かごを最新の状態にしました。", { exact: true }).waitFor();
  const scan = async (code: string) => { await page.getByLabel("商品コードを入力", { exact: true }).fill(code); await page.getByRole("button", { name: "コードで追加", exact: true }).click(); await saved(); };
  const set = (product: string) => page.getByRole("article", { name: /^セット割/ }).filter({ hasText: product });
  const timeSale = (product: string) => page.getByRole("article", { name: /^タイムセール/ }).filter({ hasText: product });
  const next = async () => {
    await page.getByRole("button", { name: "店舗・来店を選ぶ", exact: true }).click();
    page.once("dialog", d => { void d.accept(); });
    const store = page.getByRole("heading", { name: "広島デモ店", exact: true }).locator("..");
    await store.getByRole("button", { name: "空のかごで新しく来店する", exact: true }).click(); await ready();
  };
  await page.goto(origin + "/App/demo-offers");
  await page.getByRole("heading", { name: "セット割・タイムセールの試し方", exact: true }).waitFor();
  assert.equal(await page.getByRole("region").count(), 4); assert.equal(await page.getByLabel("メールアドレス").count(), 0);
  await page.screenshot({ path: resolve(output, "guide-mobile.png") });
  await page.getByRole("link", { name: "広島デモ店で試す", exact: true }).click();
  await page.getByLabel("メールアドレス").fill("user3@example.test"); await page.getByLabel("パスワード", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("button", { name: "この店舗で買い物を始める", exact: true }).click(); await ready();
  await timeSale("成分無調整牛乳").waitFor(); await timeSale("若鶏の唐揚げ").waitFor();
  assert.equal(await page.getByRole("article", { name: /^タイムセール/ }).count(), 2);
  assert.equal(await page.getByRole("article", { name: /^セット割/ }).count(), 0);
  pass("the public guide selects the right store; today's two sales appear without waiting and overlapping offers are collapsed");

  await scan("2900000000100"); await set("トマトパスタソース").waitFor(); assert.equal(await set("トマトパスタソース").count(), 1);
  await set("トマトパスタソース").getByRole("button").click(); await saved(); assert.equal(total(await snapshot()), 493);
  await page.getByRole("button", { name: /買い物かごを開く/ }).click();
  await page.getByRole("button", { name: "トマトパスタソースを削除", exact: true }).click(); await saved(); assert.equal((await snapshot()).discountTotal, 0);
  await page.getByRole("button", { name: "閉じる", exact: true }).click(); await scan("2900000000162"); assert.equal(total(await snapshot()), 493);
  pass("pasta triggers one sauce set card; accepting charges 493 and removing/restoring a component cancels/restores the discount");

  await next(); await scan("2900000000049"); await set("もっちり食パン").waitFor();
  await page.getByRole("heading", { name: "いまだけのお得", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, "sets-and-sales-mobile.png") });
  await set("もっちり食パン").getByRole("button").click(); await saved(); assert.equal(total(await snapshot()), 421);
  await timeSale("成分無調整牛乳").getByRole("button", { name: "かごの商品をセール価格にする", exact: true }).click(); await saved();
  assert.equal(total(await snapshot()), 397);
  pass("milk triggers the bread set at 421; applying the milk sale gives 397 using the largest discount per product");

  await next(); await timeSale("若鶏の唐揚げ").getByRole("button", { name: "セール価格でかごに追加", exact: true }).click(); await saved(); assert.equal(total(await snapshot()), 175);
  await page.getByRole("button", { name: /買い物かごを開く/ }).click();
  await page.getByRole("button", { name: "若鶏の唐揚げ 100gを1点増やす", exact: true }).click(); await saved(); assert.equal(total(await snapshot()), 350);
  await page.screenshot({ path: resolve(output, "sale-cart-mobile.png") });
  await page.reload(); await ready(); assert.equal(total(await snapshot()), 350);
  pass("deli sale adds at 175, two units total 350, and the saved discount survives reload");

  await next(); const before = await snapshot();
  await fixture.db.query("update store_offers set status='inactive' where kind='time_sale'");
  await timeSale("成分無調整牛乳").getByRole("button").click();
  await page.getByText("このお得情報は終了したか、いまは利用できません。", { exact: true }).waitFor();
  assert.deepEqual(await snapshot(), before); assert.equal(errors.length, 0, errors.join("\n"));
  pass("stopping a displayed sale is rejected by the DB without changing the cart");
  await writeFile(resolve(output, "result.json"), JSON.stringify({ passed }, null, 2));
} finally { await browser?.close(); server.kill(); await fixture.close(); }
