// Production UI with local Auth/membership fixture and mock promotion actions.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { createSignageDatabase } from "../../kago-ads/tests/fixtures/signage-database.mts";

const fixture = await createSignageDatabase(), base = "http://127.0.0.1:3264";
const api = createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const headers = new Headers(); for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(",") : value);
    let response: Response;
    if (req.method === "GET" && req.url?.split("?")[0] === "/rest/v1/store_products") {
      const who = await fixture.fetcher("https://fixture.supabase.co/auth/v1/user", { headers }); response = who.ok ? Response.json([]) : who;
    } else response = await fixture.fetcher("https://fixture.supabase.co" + req.url, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks).toString() : undefined });
    res.statusCode = response.status; response.headers.forEach((value, key) => res.setHeader(key, value)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.statusCode = 500; res.end("local fixture failed"); }
});
await new Promise<void>(resolve => api.listen(0, "127.0.0.1", resolve));
const address = api.address(); assert(address && typeof address !== "string");
const env = { ...process.env, NEXT_PUBLIC_INSIGHT_DATA_SOURCE: "mock", NEXT_PUBLIC_INSIGHT_BASE_PATH: "", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:" + address.port, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture" };
let log = "", browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
function next(...args: string[]) {
  const p = spawn(process.execPath, ["node_modules/next/dist/bin/next", ...args], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  p.stdout.on("data", c => log = (log + c).slice(-4000)); p.stderr.on("data", c => log = (log + c).slice(-4000)); return p;
}
let server: ReturnType<typeof next> | undefined;
const passed: string[] = [], pass = (s: string) => { passed.push(s); console.log("PASS " + s); };
try {
  const build = next("build", "--webpack"); assert.equal(await new Promise<number | null>(resolve => build.once("exit", resolve)), 0, log);
  server = next("start", "--hostname", "127.0.0.1", "--port", "3264");
  for (let i = 0; i < 90; i++) { if (server.exitCode !== null) throw Error(log); try { if ((await fetch(base + "/login", { signal: AbortSignal.timeout(3000) })).ok) break; } catch { /* starting */ } if (i === 89) throw Error(log); await delay(500); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "/usr/bin/google-chrome" });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(base + "/login"); await page.getByLabel("メールアドレス").fill("store@example.test"); await page.getByLabel("パスワード").fill("fixture-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click(); await page.waitForURL(base + "/promotions");
  await page.getByRole("button", { name: "編集する", exact: true }).first().click();
  const reason = page.getByLabel("おすすめの理由", { exact: true }); await reason.fill("通信が途切れても保持する入力");
  let attempts = 0;
  await page.route("**/promotions", async route => { if (route.request().method() === "POST") { attempts++; await route.abort("failed"); } else await route.continue(); });
  await page.getByRole("button", { name: "新しい版として保存", exact: true }).click();
  await page.getByRole("button", { name: "新しい版として保存", exact: true }).waitFor({ timeout: 6000 });
  await page.getByRole("alert").filter({ hasText: "結果を確認できません" }).waitFor(); assert.equal(await reason.inputValue(), "通信が途切れても保持する入力");
  assert.equal(attempts, 1); pass("編集の通信失敗を案内し、入力を保持して処理中を解除");
  await page.unroute("**/promotions"); await page.getByRole("button", { name: "新しい版として保存", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "版として保存しました" }).waitFor(); pass("既存版の編集を明示的に再試行できる");

  await page.route("**/promotions", async route => { if (route.request().method() === "POST") await route.abort("failed"); else await route.continue(); });
  await page.getByRole("button", { name: "停止する", exact: true }).first().click();
  await page.getByRole("alert").filter({ hasText: "結果を確認できません" }).waitFor(); await page.getByRole("button", { name: "停止する", exact: true }).first().waitFor();
  assert.equal(await page.getByRole("button", { name: "停止する", exact: true }).first().isEnabled(), true);
  await page.unroute("**/promotions"); await page.getByRole("button", { name: "停止する", exact: true }).first().click();
  await page.getByRole("status").filter({ hasText: "おすすめを停止しました" }).waitFor(); pass("停止の通信失敗でも操作を戻し、再操作できる");

  await page.getByRole("button", { name: "おすすめを追加する", exact: true }).click(); await reason.fill("新規の応答喪失でも残る入力");
  let creates = 0;
  await page.route("**/promotions", async route => { if (route.request().method() === "POST") { creates++; await route.fetch(); await route.abort("failed"); } else await route.continue(); });
  await page.getByRole("button", { name: "この内容で追加", exact: true }).click(); await page.getByRole("alert").filter({ hasText: "結果を確認できません" }).waitFor();
  const add = page.getByRole("button", { name: "この内容で追加", exact: true }); assert.equal(await add.isDisabled(), true);
  assert.equal(await reason.inputValue(), "新規の応答喪失でも残る入力"); assert.equal(creates, 1);
  pass("新規の結果不明時は入力を残し、無条件の追加再送を防ぐ");
  await page.getByRole("button", { name: "一覧を再読み込み", exact: true }).click(); await delay(400);
  assert.equal(await reason.inputValue(), "新規の応答喪失でも残る入力"); assert.equal(creates, 1);
  assert.equal(await add.isDisabled(), true); pass("一覧だけを再取得でき、入力や未確認状態を保持して自動再送しない");
  await page.setViewportSize({ width: 375, height: 900 });
  const alert = page.getByRole("alert").filter({ hasText: "結果を確認できません" }); await alert.scrollIntoViewIfNeeded();
  const box = await alert.boundingBox(); assert(box && box.x >= 0 && box.x + box.width <= 376);
  await mkdir("../../internal/promotion-recovery-evidence", { recursive: true });
  await page.screenshot({ path: "../../internal/promotion-recovery-evidence/promotion-recovery.png", fullPage: true, animations: "disabled" });
  assert.deepEqual(errors, []); pass("375pxでも復旧案内が収まり、未処理のブラウザ例外がない");
  console.log(passed.length + " promotion recovery scenarios passed.");
} catch (error) { console.error(log.slice(-2000)); throw error; }
finally { await browser?.close(); server?.kill(); api.closeAllConnections(); await new Promise<void>(resolve => api.close(() => resolve())); await fixture.close(); }
