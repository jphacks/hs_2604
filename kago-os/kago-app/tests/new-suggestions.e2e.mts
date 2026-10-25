// #156: actual Next UI/API + official migrations/RLS, with locally stubbed Auth/PostgREST only.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";
import { PRODUCT } from "./fixtures/offers.mts";
import { seedEventSuggestions } from "./fixtures/app-events.mts";
import type { SavedSelection } from "../src/features/recommendations/selection-contracts.ts";

const fixture = await createCartBackend({ offers: true }); await seedEventSuggestions(fixture);
await fixture.db.query("update products set name=$1 where id=$2", ["瀬戸内産完熟トマトをじっくり煮込んだ濃厚トマトパスタソース 家族用大容量ボトル 500g", PRODUCT.sauce]);
await fixture.db.query("update makers set display_name=$1 where id=$2", ["瀬戸内の架空トマト食品メーカー株式会社", id(800)]);
const origin = "http://127.0.0.1:3124", output = resolve("../../internal/recommendation-new-evidence"); await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3124"], {
  env: { ...process.env, KAGO_NEXT_DIST_DIR: ".next/recommendation-new-e2e", KAGO_DEMO_ENABLED: "0", NEXT_PUBLIC_SUPABASE_URL: fixture.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" },
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let log = ""; server.stdout.on("data", c => { log += c; }); server.stderr.on("data", c => { log += c; });
let browser;
const passed: string[] = [], pass = (s: string) => { passed.push(s); console.log("PASS: " + s); };
try {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw Error(log);
    try { if ((await fetch(origin + "/api/shopping")).status === 401) break; } catch { /* starting */ }
    if (i === 59) throw Error(log); await delay(1000);
  }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } }), page = await context.newPage(); page.setDefaultTimeout(30000);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const region = () => page.getByRole("region", { name: "あなたへのおすすめ" });
  const card = () => region().getByRole("article");
  const badge = () => card().getByLabel("新しく更新されたおすすめ", { exact: true });
  let latest: SavedSelection | undefined, fail = false;
  await page.route("**/api/recommendations", async route => {
    if (fail) { await route.fulfill({ status: 503, json: { code: "connection_failed" } }); return; }
    const response = await route.fetch(); latest = await response.json(); await route.fulfill({ response });
  });
  const ready = async (version: number) => {
    for (let i = 0; i < 200; i++) {
      if (latest?.cartVersion === version && await card().count() === 1) {
        const slot = await card().getAttribute("data-selection-item-id");
        if (latest.items.some(item => item.selectionItemId === slot)) return;
      }
      await delay(50);
    }
    throw Error("Recommendations did not settle");
  };
  const saved = () => page.getByText("かごを保存しました。", { exact: true }).waitFor();
  const increment = async () => {
    await page.getByRole("button", { name: /買い物かごを開く/ }).click();
    await page.getByRole("button", { name: "スパゲッティ 500gを1点増やす", exact: true }).click(); await saved();
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
  };
  const next = () => region().getByRole("button", { name: "次のおすすめ", exact: true }).click();
  const checkFit = async () => {
    const r = await card().evaluate(el => {
      const marker = el.querySelector('[aria-label="新しく更新されたおすすめ"]');
      return { height: el.clientHeight, content: el.scrollHeight, right: el.getBoundingClientRect().right,
        badgeRight: marker?.getBoundingClientRect().right, badgeLeft: marker?.getBoundingClientRect().left,
        labelRight: marker?.previousElementSibling?.getBoundingClientRect().right,
        page: document.documentElement.scrollWidth, viewport: innerWidth };
    });
    assert(r.page <= r.viewport, JSON.stringify(r)); assert(r.content <= r.height + 1, JSON.stringify(r));
    if (r.badgeRight !== undefined) assert(r.badgeRight <= r.right && r.badgeLeft! >= r.labelRight!, JSON.stringify(r));
  };
  const newPromo = async (n: number) => {
    await fixture.db.query("update promotion_versions set status='inactive' where promotion_id=$1 and status='active'", [id(806)]);
    await fixture.db.query(`insert into promotion_versions(id,promotion_id,version,channels,time_windows,priority,reason_text,starts_at,ends_at)
      values ($1,$2,$3,'{app}','[]',$4,$5,now()-interval '1 hour',now()+interval '1 day')`, [id(820 + n), id(806), n, 9 + n, `新しい店舗おすすめ ${n}`]);
  };
  await page.goto(origin + "/App"); await page.getByLabel("メールアドレス").fill("user3@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click(); await page.getByRole("button", { name: "続きから開く", exact: true }).first().click(); await ready(0);
  assert.equal(await badge().count(), 0); pass("the first accepted recommendations have no NEW badge");

  await page.getByLabel("商品コードを入力", { exact: true }).fill("2900000000100");
  await page.getByRole("button", { name: "コードで追加", exact: true }).click(); await saved(); await ready(1);
  await badge().waitFor(); assert.equal(await card().getAttribute("data-selection-item-id"), latest!.items.find(i => i.placementType === "sponsored")?.selectionItemId);
  await region().getByRole("button", { name: "おすすめの自動切り替えを停止", exact: true }).click();
  await checkFit(); await card().screenshot({ path: resolve(output, "new-ad-375.png") });
  await next(); assert.equal(await badge().count(), 0, "unchanged store promotion is not new");
  await next(); await badge().waitFor(); await checkFit();
  await card().screenshot({ path: resolve(output, "new-organic-375.png") });
  await next(); await badge().waitFor();
  pass("new sponsored and organic content get NEW at top right, unchanged store content does not, and rotation preserves the markers");

  await increment(); await ready(2);
  for (let i = 0; i < 3; i++) { assert.equal(await badge().count(), 0); await next(); }
  pass("a quantity-driven reselection creates fresh IDs without marking unchanged content NEW");

  await newPromo(2); await increment(); await ready(3); assert.equal(await badge().count(), 0);
  await next(); await badge().waitFor(); await checkFit();
  await card().screenshot({ path: resolve(output, "new-store-375.png") });
  await page.setViewportSize({ width: 320, height: 740 }); await checkFit();
  await next(); await next(); await checkFit();
  await page.setViewportSize({ width: 375, height: 812 });
  pass("a new store promotion version marks the same product NEW and the badge/card fit 320–375px");

  await page.reload(); await ready(3); assert.equal(await badge().count(), 0); await next(); assert.equal(await badge().count(), 0);
  await newPromo(3); fail = true; await increment();
  await region().getByRole("button", { name: "おすすめを再試行", exact: true }).waitFor();
  fail = false; await region().getByRole("button", { name: "おすすめを再試行", exact: true }).click(); await ready(4);
  await next(); await badge().waitFor();
  pass("reload is a new baseline; a failed refresh retains the prior accepted content so a recovered new promotion is marked");

  await page.getByRole("button", { name: "店舗・来店を選ぶ", exact: true }).click();
  page.once("dialog", d => { void d.accept(); });
  latest = undefined;
  await page.getByRole("button", { name: "空のかごで新しく来店する", exact: true }).first().click();
  await ready(0); assert.equal(await badge().count(), 0);
  assert.equal(errors.length, 0, errors.join("\n"));
  pass("a new visit resets the comparison and does not carry another visit's NEW badge");
  await writeFile(resolve(output, "result.json"), JSON.stringify({ passed }, null, 2));
} finally { await browser?.close(); server.kill(); await fixture.close(); }
