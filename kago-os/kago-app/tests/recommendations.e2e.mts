// APP-05 API through the actual Next server (Auth/PostgREST adapter + official SQL on PGlite). No UI: cards are APP-06.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";

const fixture = await createCartBackend({ accountHistory: true });
await fixture.db.exec(`insert into store_promotions(id,store_id,product_id) values ('${id(700)}','${id(1)}','${id(21)}');
  insert into promotion_versions(id,promotion_id,version,channels,time_windows,priority,reason_text,starts_at,ends_at)
  values ('${id(701)}','${id(700)}',1,'{app}','[]',3,'旬のりんごです',now()-interval '1 day',now()+interval '1 day')`);
const origin = "http://127.0.0.1:3111";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3111"], {
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: fixture.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let log = ""; server.stdout.on("data", c => { log += c; }); server.stderr.on("data", c => { log += c; });
let browser;
try {
  for (let i = 0; i < 90; i++) { if (server.exitCode !== null) throw Error(log); try { if ((await fetch(origin + "/api/shopping")).status === 401) break; } catch { /* starting */ } if (i === 89) throw Error(log); await delay(1000); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const a = await browser.newContext(); const page = await a.newPage(); page.setDefaultTimeout(45000);
  const anon = await a.request.get(origin + "/api/recommendations");
  assert.equal(anon.status(), 401); assert.match(anon.headers()["cache-control"], /private, no-store/);
  await page.goto(origin + "/App"); await page.getByLabel("メールアドレス").fill("user3@example.test"); await page.getByLabel("パスワード", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click(); await page.getByRole("button", { name: "続きから開く", exact: true }).first().click();
  await page.getByText("かごを最新の状態にしました。", { exact: true }).waitFor();
  const r = await a.request.get(origin + "/api/recommendations"); assert.equal(r.status(), 200);
  const body = await r.json();
  assert.equal(body.visitId, id(13)); assert.equal(body.ruleVersion, 2);
  assert.deepEqual(body.items.map((i: { placementType: string; reasonText: string }) => [i.placementType, i.reasonText]), [["store_promo", "旬のりんごです"]]);
  assert.equal((await a.request.get(origin + "/api/recommendations")).status(), 200);
  assert.equal((await fixture.db.query("select * from selections where visit_id=$1", [id(13)])).rows.length, 1);
  console.log("PASS: /api/recommendations authenticates, selects for the cookie's visit, saves once and returns DB ids");
} finally { await browser?.close(); server.kill(); await fixture.close(); }
