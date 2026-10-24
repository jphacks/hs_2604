// APP-07: real Next routes + browser geometry + Supabase client + official SQL/RLS on PGlite.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Page } from "playwright";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";
import { PRODUCT } from "./fixtures/offers.mts";
import { seedEventSuggestions } from "./fixtures/app-events.mts";
import type { AppEvent } from "../src/features/events/contracts.ts";
import type { SavedSelection } from "../src/features/recommendations/selection-contracts.ts";

const fixture = await createCartBackend({ offers: true });
await seedEventSuggestions(fixture);
await fixture.rpc("app_set_cart_item", [id(13), id(3001), PRODUCT.pasta, 1, 0, "manual", null]);
const origin = "http://127.0.0.1:3117";
const output = resolve("../../internal/app07-evidence"); await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3117"], {
  env: { ...process.env, KAGO_NEXT_DIST_DIR: ".next/app07-e2e", KAGO_DEMO_ENABLED: "0", NEXT_PUBLIC_SUPABASE_URL: fixture.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" },
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let log = ""; server.stdout.on("data", c => { log += c; }); server.stderr.on("data", c => { log += c; });
let browser; let page: Page | undefined; const passed: string[] = [];
const pass = (message: string) => { passed.push(message); console.log("PASS: " + message); };
async function count(type: string, slot?: string) {
  return (await fixture.db.query<{ n: number }>("select count(*)::int n from events where event_type=$1 and ($2::uuid is null or selection_item_id=$2)", [type, slot ?? null])).rows[0].n;
}
async function until(check: () => Promise<boolean>) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await delay(100); }
  throw Error("Condition did not become true");
}
try {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw Error(log);
    try { if ((await fetch(origin + "/api/shopping")).status === 401) break; } catch { /* Starting. */ }
    if (i === 59) throw Error(log); await delay(1000);
  }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const context = await browser.newContext({ viewport: { width: 375, height: 600 } });
  page = await context.newPage(); page.setDefaultTimeout(30000); const p = page;
  const errors: string[] = []; p.on("pageerror", e => errors.push(e.message));
  const region = () => p.getByRole("region", { name: "あなたへのおすすめ" });
  const visibleCard = () => region().getByRole("article");
  const center = async () => { await visibleCard().evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" })); };
  const hide = async () => { await p.evaluate(() => window.scrollTo(0, 0)); };
  await p.goto(origin + "/App");
  await p.getByLabel("メールアドレス").fill("user3@example.test");
  await p.getByLabel("パスワード", { exact: true }).fill("fixture-password");
  await p.getByRole("button", { name: "ログイン", exact: true }).click();
  await p.getByRole("button", { name: "続きから開く", exact: true }).first().click();
  await visibleCard().waitFor();
  const selection = await (await context.request.get(origin + "/api/recommendations")).json() as SavedSelection;
  const ad = selection.items.find(i => i.placementType === "sponsored")!;
  assert(ad); assert(selection.items.length > 1);
  await delay(1300);
  assert.equal(await count("recommendation_impression"), 0, "unseen candidates do not count");
  await region().getByRole("button", { name: "おすすめの自動切り替えを停止" }).click();
  // Pause may scroll the controls into view. Move the card to 40% visible before one second.
  await visibleCard().evaluate(el => { const r = el.getBoundingClientRect(); window.scrollTo(0, window.scrollY + r.top - (window.innerHeight - r.height * 0.4)); });
  await delay(1300); assert.equal(await count("recommendation_impression"), 0);
  await center(); await delay(600); await hide(); await delay(200); await center(); await delay(600);
  assert.equal(await count("recommendation_impression"), 0, "visibility must be continuous");
  await until(async () => await count("recommendation_impression", ad.selectionItemId) === 1);
  assert.equal(await count("recommendation_impression"), 1, "hidden carousel slots stay uncounted");
  pass("viewport clipping, <50%, interrupted one-second exposure and hidden carousel slots have correct counts");
  await p.screenshot({ path: resolve(output, "sponsored-mobile.png") });

  // Lose only the acknowledgement after a real DB commit, then reload and resend unchanged.
  const attempts: AppEvent[] = [];
  await p.route("**/api/events", async route => {
    const body = route.request().postDataJSON() as AppEvent;
    if (body.event_type === "recommendation_click") { attempts.push(body); await route.fetch(); await route.abort("failed"); }
    else await route.continue();
  });
  await visibleCard().getByRole("button", { name: /の詳細/ }).click();
  await until(async () => await count("recommendation_click", ad.selectionItemId) === 1);
  await until(async () => (await p.evaluate(() => JSON.parse(sessionStorage.getItem("kago-events:00000000-0000-4000-8000-000000000003") ?? "[]"))).some((e: AppEvent) => e.event_type === "recommendation_click"));
  const lost = attempts[0]; assert(lost);
  await p.reload(); await visibleCard().waitFor();
  await p.unroute("**/api/events");
  await p.evaluate(() => window.dispatchEvent(new Event("online")));
  await until(async () => (await p.evaluate(() => JSON.parse(sessionStorage.getItem("kago-events:00000000-0000-4000-8000-000000000003") ?? "[]"))).length === 0);
  assert.equal(await count("recommendation_click", ad.selectionItemId), 1);
  const stored = (await fixture.db.query<{ occurred_at: string }>("select occurred_at from events where event_id=$1", [lost.event_id])).rows[0];
  assert.equal(new Date(stored.occurred_at).toISOString(), lost.occurred_at);
  await region().getByRole("button", { name: "おすすめの自動切り替えを停止" }).click();
  await center(); await delay(1300);
  assert.equal(await count("recommendation_impression", ad.selectionItemId), 1);
  pass("lost acknowledgement, reload and original-id retry keep one click and one impression");

  await visibleCard().getByRole("button", { name: /をかごに追加/ }).click();
  await p.getByText("かごを保存しました。", { exact: true }).waitFor();
  await until(async () => await count("recommendation_click", ad.selectionItemId) === 2);
  const added = (await fixture.db.query<{ payload: {source:string}; selection_item_id: string }>("select payload,selection_item_id from events where event_type='cart_item_added' and product_id=$1", [ad.product.productId])).rows;
  assert.equal(added.length, 1); assert.equal(added[0].payload.source, "recommendation"); assert.equal(added[0].selection_item_id, ad.selectionItemId);
  assert.equal(await count("product_scanned"), 0);
  await p.getByRole("button", { name: /買い物かごを開く/ }).click();
  await p.getByRole("button", { name: `${ad.product.name}を削除`, exact: true }).click();
  await p.getByText("かごを保存しました。", { exact: true }).waitFor();
  assert.equal(await count("cart_item_removed"), 1);
  await p.getByRole("button", { name: "閉じる", exact: true }).click();
  pass("ad add button emits exactly one click and one attributed cart add; removal is separate, without manual scan duplication");

  // Freeze the next selection while opening a new, never-exposed slide in <1s.
  await visibleCard().waitFor();
  const latest = await (await context.request.get(origin + "/api/recommendations")).json() as SavedSelection;
  await until(async () => {
    const currentId = await visibleCard().getAttribute("data-selection-item-id");
    return latest.items.some(i => i.selectionItemId === currentId);
  });
  await center();
  await region().getByRole("button", { name: "次のおすすめ" }).click();
  const quickId = await visibleCard().getAttribute("data-selection-item-id");
  assert(latest.items.some(i => i.selectionItemId === quickId));
  assert.equal(await count("recommendation_impression", quickId!), 0);
  // A person can tap during the slide animation; avoid Playwright's stability wait consuming the second.
  await visibleCard().getByRole("button", { name: /の詳細/ }).dispatchEvent("click");
  await until(async () => await count("recommendation_click", quickId!) === 1);
  await delay(1300);
  assert.equal(await count("recommendation_impression", quickId!), 0);
  await p.getByRole("button", { name: "閉じる", exact: true }).click();
  pass("quick detail click is recorded without inventing an impression; modal time is excluded");

  await p.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await delay(1300); assert.equal(await count("recommendation_impression", quickId!), 0);
  await p.evaluate(() => { delete (document as unknown as { hidden?: boolean }).hidden; document.dispatchEvent(new Event("visibilitychange")); });
  await until(async () => await count("recommendation_impression", quickId!) === 1);
  pass("a hidden-document visibility signal resets exposure; returning visible starts a new full second");

  const body = { ...lost, event_id: crypto.randomUUID(), visit_id: id(15) };
  const rejected = await context.request.post(origin + "/api/events", { headers: { Origin: origin }, data: body });
  assert.equal(rejected.status(), 403);
  const forged = await context.request.post(origin + "/api/events", { headers: { Origin: "https://other.example" }, data: lost });
  assert.equal(forged.status(), 403);
  const malformed = await context.request.post(origin + "/api/events", { headers: { Origin: origin }, data: {...lost,event_type:"cart_item_added"} });
  assert.equal(malformed.status(), 400);
  const anonymous = await browser.newContext();
  assert.equal((await anonymous.request.post(origin + "/api/events", { headers: { Origin: origin }, data: lost })).status(), 401);
  await anonymous.close();
  pass("HTTP route rejects foreign visits, cross-origin writes, forged cart events and anonymous writes");
  assert.equal(errors.length, 0, errors.join("\n"));
  assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await writeFile(resolve(output, "result.json"), JSON.stringify({ passed }, null, 2));
  console.log(`${passed.length} browser/DB scenarios passed.`);
} catch (error) {
  if (page) { await page.screenshot({ path: resolve(output, "failure.png"), fullPage: true }); console.log((await page.locator("body").innerText()).slice(0, 2000)); }
  await writeFile(resolve(output, "events.json"), JSON.stringify((await fixture.db.query("select event_type,selection_item_id,occurred_at,payload from events order by occurred_at")).rows, null, 2));
  await writeFile(resolve(output, "server.log"), log); throw error;
} finally { await browser?.close(); server.kill(); await fixture.close(); }
