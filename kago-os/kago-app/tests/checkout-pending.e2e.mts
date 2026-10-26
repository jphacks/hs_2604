// Next UI/API with official migrations/RLS in PGlite; Auth/PostgREST are local adapters.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";

const fixture = await createCartBackend(), base = "http://127.0.0.1:3260";
let log = "";
const env = { ...process.env, KAGO_NEXT_DIST_DIR: ".next/checkout-pending", KAGO_DEMO_ENABLED: "0", NEXT_PUBLIC_SUPABASE_URL: fixture.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" };
function next(...args: string[]) {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", ...args], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", c => log = (log + c).slice(-4000)); child.stderr.on("data", c => log = (log + c).slice(-4000));
  return child;
}
let server: ReturnType<typeof next> | undefined, browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const passed: string[] = [], pass = (s: string) => { passed.push(s); console.log("PASS " + s); };
try {
  const build = next("build", "--webpack");
  const built = await new Promise<number | null>(resolve => build.once("exit", resolve));
  assert.equal(built, 0, log);
  server = next("start", "--hostname", "127.0.0.1", "--port", "3260");
  for (let i = 0; i < 90; i++) { if (server.exitCode !== null) throw Error(log); try { if ((await fetch(base + "/api/shopping", { signal: AbortSignal.timeout(3000) })).status === 401) break; } catch { /* Server is starting. */ } if (i === 89) throw Error(log); await delay(500); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "/usr/bin/google-chrome" });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  // Unrelated recommendation retries must not interfere with the cart recovery being tested.
  await page.route("**/api/recommendations", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "connection_failed" }) }));
  await page.goto(base + "/App"); await page.getByLabel("メールアドレス").fill("user3@example.test"); await page.getByLabel("パスワード", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("button", { name: /前回の店舗から再開|この店舗で買い物を始める/ }).click();
  await page.getByText("かごを最新の状態にしました。", { exact: true }).first().waitFor();
  const snapshot = async () => { const r = await context.request.get(base + "/api/cart"); assert.equal(r.status(), 200); return r.json(); };
  const cart = await snapshot();
  const seed = await context.request.post(base + "/api/cart", { headers: { Origin: base }, data: {
    action: "set", visitId: cart.visit.id, productId: id(20), quantity: 2, source: "manual", requestId: randomUUID(), expectedVersion: cart.visit.cart_version,
  } }); assert.equal(seed.status(), 200);
  await page.reload(); await page.getByText("かごを最新の状態にしました。", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "買い物かごを開く、現在2点", exact: true }).click();
  const basket = page.getByRole("dialog", { name: "買い物かご", exact: true });
  const checkout = basket.getByRole("button", { name: "レジに進む", exact: true });
  assert.equal(await checkout.isEnabled(), true); pass("保存済みのかごではレジへ進める");
  await page.route("**/api/cart", async route => { if (route.request().method() === "POST") await route.abort("failed"); else await route.continue(); });
  await basket.getByRole("button", { name: /検証ミルク.*減/ }).click();
  await basket.getByRole("button", { name: "同じ操作を再試行", exact: true }).waitFor();
  assert.equal(await checkout.isDisabled(), true, "unconfirmed cart writes must block checkout");
  pass("保存結果が未確認の間はレジへ進めない");
  await mkdir("../../internal/checkout-pending-evidence", { recursive: true });
  await page.screenshot({ path: "../../internal/checkout-pending-evidence/checkout-pending.png", animations: "disabled" });
  await page.unroute("**/api/cart");
  await basket.getByRole("button", { name: "同じ操作を再試行", exact: true }).click();
  await page.getByText("かごを保存しました。", { exact: true }).first().waitFor();
  assert.equal(await checkout.isEnabled(), true); assert.equal((await snapshot()).cart[0].quantity, 1);
  await checkout.click(); await page.waitForURL(base + "/App/checkout");
  await page.getByRole("heading", { name: "お会計の確認", exact: true }).waitFor();
  assert.match(await page.locator(".checkout-preview-total").innerText(), /248/);
  assert.deepEqual(errors, []); pass("同じ操作で解消した後は、保存された数量と金額で会計確認へ進める");
  console.log(passed.length + " checkout pending scenarios passed.");
} catch (error) { console.error(log.slice(-1500)); throw error; }
finally { await browser?.close(); server?.kill(); await fixture.close(); }
