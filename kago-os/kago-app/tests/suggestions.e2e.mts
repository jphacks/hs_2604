// APP-06 browser check: suggestion cards on the shopping screen (Next UI + APP-05 API + official SQL on PGlite).
// The normal path uses the real /api/recommendations; layouts that the fixture data cannot produce
// (all three types at once, a very long name, empty, failure, stale) are served by request interception.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Page, type Route } from "playwright";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";
import { PRODUCT } from "./fixtures/offers.mts";

const fixture = await createCartBackend({ accountHistory: true, offers: true });
await fixture.db.exec(`insert into store_promotions(id,store_id,product_id) values ('${id(700)}','${id(1)}','${id(21)}');
  insert into promotion_versions(id,promotion_id,version,channels,time_windows,priority,reason_text,starts_at,ends_at)
  values ('${id(701)}','${id(700)}',1,'{app}','[]',3,'旬のりんごです。今朝入荷しました',now()-interval '1 day',now()+interval '1 day')`);
const origin = "http://127.0.0.1:3112";
const output = resolve("../../internal/app06-evidence"); await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3112"], {
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: fixture.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let log = ""; server.stdout.on("data", c => { log += c; }); server.stderr.on("data", c => { log += c; });
let browser; let active: Page | undefined; const passed: string[] = []; const pass = (s: string) => { passed.push(s); console.log("PASS: " + s); };
const LONG = "瀬戸内産完熟トマトをじっくり煮込んだ濃厚トマトパスタソース 家族で使える大容量ボトル 500g（期間限定パッケージ）";
try {
  for (let i = 0; i < 90; i++) { if (server.exitCode !== null) throw Error(log); try { if ((await fetch(origin + "/api/shopping")).status === 401) break; } catch { /* starting */ } if (i === 89) throw Error(log); await delay(1000); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const a = await browser.newContext({ viewport: { width: 375, height: 812 } }); const page = await a.newPage(); active = page; page.setDefaultTimeout(45000);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const section = () => page.getByRole("region", { name: "あなたへのおすすめ" });
  const cards = () => section().getByRole("article");
  const cartVersion = async () => (await (await a.request.get(origin + "/api/cart")).json()).visit.cart_version as number;
  // Also the overflow-x-hidden <main>: hidden overflow can still be scrolled by focus/scrollIntoView.
  const noHorizontalOverflow = async () => {
    const r = await page.evaluate(() => {
      const main = document.querySelector("main")!;
      const wide = [...main.querySelectorAll("*")].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > window.innerWidth + 1 || b.left < -1) && !e.closest("ul[aria-label='おすすめ商品'] li") && getComputedStyle(e).position !== "fixed"; })
        .slice(0, 5).map(e => `${e.tagName}.${String(e.className).slice(0, 60)} ${Math.round(e.getBoundingClientRect().left)}..${Math.round(e.getBoundingClientRect().right)}`);
      return { doc: document.documentElement.scrollWidth, inner: window.innerWidth, main: main.scrollWidth, mainClient: main.clientWidth, wide };
    });
    assert(r.doc <= r.inner + 1 && r.main <= r.mainClient + 1, `page must not scroll sideways: ${JSON.stringify(r)}`);
  };

  await page.goto(origin + "/App"); await page.getByLabel("メールアドレス").fill("user3@example.test"); await page.getByLabel("パスワード", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click(); await page.getByRole("button", { name: "続きから開く", exact: true }).first().click();
  await page.getByText("かごを最新の状態にしました。", { exact: true }).waitFor();

  // 1. Real selection: the store pick is labelled as the store's, with the store's reason.
  const promo = section().getByRole("article", { name: "店舗からのおすすめ：検証りんご" });
  await promo.waitFor(); await promo.getByText("旬のりんごです。今朝入荷しました").waitFor();
  assert.equal(await section().getByText("広告", { exact: true }).count(), 0, "no ad label without a sponsored slot");
  pass("real APP-05 selection is shown; the store pick has its own label and reason");

  await promo.getByRole("button", { name: /^検証りんごの詳細/ }).click();
  const dialog = page.getByRole("dialog", { name: "検証りんご" });
  await dialog.getByText("店舗が選んだおすすめ商品です。").waitFor();
  await dialog.getByRole("button", { name: "かごに追加", exact: true }).click();
  await page.getByText("かごを保存しました。", { exact: true }).waitFor();
  const cart = await (await a.request.get(origin + "/api/cart")).json();
  assert(cart.cart.some((l: { productId: string }) => l.productId === id(21)));
  await section().getByText("いまのかごに合うおすすめはありません。", { exact: false }).waitFor();
  pass("detail → add to cart works; the next selection excludes it and the empty state is explained");

  // 2. All three types, a long name and a sponsor — served for the current cart version.
  const three = async (route: Route) => {
    const v = await cartVersion();
    const base = { rank: 1, adPlacementId: null, promotionVersionId: null, sponsor: null, evidence: {} };
    await route.fulfill({ json: { visitId: id(13), cartVersion: v, ruleVersion: 1, selectionId: id(900), items: [
      { ...base, slot: 1, selectionItemId: id(901), placementType: "organic", reasonCode: "co_purchase", reasonText: "スパゲッティの仕上げに合います",
        product: { productId: PRODUCT.basil, code: "2900000000179", name: "生バジル", category: "青果", price: 198 } },
      { ...base, slot: 2, rank: 2, selectionItemId: id(902), placementType: "store_promo", reasonCode: "store_pick", reasonText: "店内で揚げたてです", promotionVersionId: id(701),
        product: { productId: PRODUCT.karaage, code: "PLU-2002", name: "若鶏の唐揚げ 100g", category: "惣菜", price: 218 } },
      { ...base, slot: 3, rank: 3, selectionItemId: id(903), placementType: "sponsored", reasonCode: "sponsored_related", reasonText: "スパゲッティを選んだ方への広告です", adPlacementId: id(904),
        sponsor: { makerName: "瀬戸内トマト食品", headline: "完熟トマトの旨みたっぷり", creativeVersionId: id(905) },
        product: { productId: PRODUCT.sauce, code: "2900000000162", name: LONG, category: "加工食品", price: 298 } },
    ] } });
  };
  await page.route("**/api/recommendations", three);
  await page.reload(); await page.getByText("かごを最新の状態にしました。", { exact: true }).waitFor();
  // One slide at a time, in the order ad → store pick → personal recommendation.
  const visibleSlide = async () => (await cards().evaluateAll(els => els.map(e => e.getAttribute("aria-label")))).join("|");
  const ad = section().getByRole("article", { name: `広告：${LONG}` });
  await ad.waitFor();
  assert.equal(await cards().count(), 1, "only the current slide is exposed");
  await ad.getByText("提供：瀬戸内トマト食品", { exact: true }).waitFor();
  assert.equal(await ad.getByRole("heading").getAttribute("title"), LONG, "the full long name stays available");
  await noHorizontalOverflow();
  await page.evaluate(() => document.getElementById("suggestions-heading")!.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: resolve(output, "slide-ad-mobile.png") });
  await section().getByRole("button", { name: "次のおすすめ", exact: true }).click();
  await section().getByRole("article", { name: "店舗からのおすすめ：若鶏の唐揚げ 100g" }).waitFor(); await delay(700);
  await page.screenshot({ path: resolve(output, "slide-store-mobile.png") });
  await section().getByRole("button", { name: "次のおすすめ", exact: true }).click();
  await section().getByRole("article", { name: "一緒におすすめ：生バジル" }).waitFor(); await delay(700);
  await page.screenshot({ path: resolve(output, "slide-organic-mobile.png") });
  await section().getByRole("button", { name: "次のおすすめ", exact: true }).click();
  await ad.waitFor();
  await section().getByRole("button", { name: "前のおすすめ", exact: true }).click();
  await section().getByRole("article", { name: "一緒におすすめ：生バジル" }).waitFor();
  pass("slides go ad → store pick → personal and wrap around; up/down buttons move one at a time");

  // Auto-rotation every few seconds; it pauses while the customer is on it and with the stop button.
  const away = async () => { await page.getByRole("heading", { name: "商品をスキャン" }).click(); await page.mouse.move(5, 5); };
  await away();
  const before = await visibleSlide(); await delay(4800);
  assert.notEqual(await visibleSlide(), before, "auto-advances after about 4 seconds");
  await section().getByRole("button", { name: "おすすめの自動切り替えを停止", exact: true }).click();
  await away();
  const stopped = await visibleSlide(); await delay(5000);
  assert.equal(await visibleSlide(), stopped, "stop keeps the current slide");
  await section().getByRole("button", { name: "おすすめの自動切り替えを再開", exact: true }).click();
  const hovered = await visibleSlide(); await section().getByRole("group", { name: "おすすめ商品" }).hover(); await delay(5000);
  assert.equal(await visibleSlide(), hovered, "hovering/focusing pauses the rotation");
  pass("auto-rotates about every 4 seconds, pauses on hover/focus and with the stop button");

  while (!(await visibleSlide()).startsWith("広告")) await section().getByRole("button", { name: "次のおすすめ", exact: true }).click();
  await ad.getByRole("button", { name: /の詳細（広告）$/ }).click();
  const adDialog = page.getByRole("dialog");
  await adDialog.getByText("この枠は広告です。提供：瀬戸内トマト食品（店舗が承認した広告）").waitFor();
  await adDialog.getByText("完熟トマトの旨みたっぷり", { exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, "ad-detail-mobile.png") });
  await adDialog.getByRole("button", { name: "かごに追加", exact: true }).click();
  await page.getByText("かごを保存しました。", { exact: true }).waitFor();
  await section().getByRole("button", { name: "おすすめの自動切り替えを停止", exact: true }).click();
  while (!(await visibleSlide()).startsWith("広告")) await section().getByRole("button", { name: "次のおすすめ", exact: true }).click();
  await ad.getByRole("button", { name: /かごに追加/ }).and(page.getByText("かごに追加済み")).waitFor();
  pass("the ad shows its sponsor and long names stay readable in the 375px layout; ad → detail → add works");
  await page.unroute("**/api/recommendations");

  // 3. Failure, then retry.
  let fail = true;
  await page.route("**/api/recommendations", async route => { if (fail) await route.abort("failed"); else await three(route); });
  await page.reload(); await page.getByText("かごを最新の状態にしました。", { exact: true }).waitFor();
  await section().getByRole("alert").getByText("おすすめを読み込めませんでした。通信状態を確認して再試行してください。").waitFor();
  await noHorizontalOverflow();
  await page.screenshot({ path: resolve(output, "error-mobile.png") });
  fail = false;
  await section().getByRole("button", { name: "おすすめを再試行", exact: true }).click();
  await section().getByRole("article", { name: `広告：${LONG}` }).waitFor();
  await page.unroute("**/api/recommendations");
  pass("a connection failure shows a retry and recovers");

  // 4. A result for an older cart version is never shown.
  await page.route("**/api/recommendations", async route => {
    const v = await cartVersion();
    await route.fulfill({ json: { visitId: id(13), cartVersion: v - 1, ruleVersion: 1, selectionId: id(910), items: [
      { slot: 1, rank: 1, selectionItemId: id(911), placementType: "organic", reasonCode: "popular", reasonText: "古いかごの結果", adPlacementId: null, promotionVersionId: null, sponsor: null, evidence: {},
        product: { productId: PRODUCT.basil, code: "2900000000179", name: "古い結果の商品", category: "青果", price: 1 } }] } });
  });
  await page.reload(); await page.getByText("かごを最新の状態にしました。", { exact: true }).waitFor(); await delay(2000);
  assert.equal(await page.getByText("古い結果の商品").count(), 0);
  await page.unroute("**/api/recommendations");
  pass("a selection made for an older cart version is not displayed");

  // 5. Empty selection layout at the narrowest common width.
  await page.setViewportSize({ width: 320, height: 720 });
  await page.route("**/api/recommendations", async route => route.fulfill({ json: { visitId: id(13), cartVersion: await cartVersion(), ruleVersion: 1, selectionId: null, items: [] } }));
  await page.reload(); await section().getByText("いまのかごに合うおすすめはありません。", { exact: false }).waitFor();
  await noHorizontalOverflow();
  await page.evaluate(() => document.getElementById("suggestions-heading")!.scrollIntoView({ block: "center" }));
  await page.screenshot({ path: resolve(output, "empty-320.png") });
  await page.unroute("**/api/recommendations");
  pass("the empty state fits a 320px screen without horizontal scrolling");

  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(`${passed.length} suggestion-card browser scenarios passed.`);
  await writeFile(resolve(output, "result.json"), JSON.stringify({ passed }, null, 2));
} catch (error) {
  if (active) { await active.screenshot({ path: resolve(output, "failure.png"), fullPage: true }); console.log((await active.locator("body").innerText()).slice(0, 2500)); }
  throw error;
} finally { await browser?.close(); server.kill(); await fixture.close(); }
