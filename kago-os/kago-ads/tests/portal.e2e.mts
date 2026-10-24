import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium, type Page } from "playwright";
import { createPortalDatabase, fixturePassword, id } from "./fixtures/portal-database.mts";

const root = new URL("../", import.meta.url).pathname;
const base = "http://127.0.0.1:3189";
const env = { ...process.env, NEXT_PUBLIC_ADS_DATA_SOURCE: "supabase",
  NEXT_PUBLIC_SUPABASE_URL: "https://ads-fixture.invalid", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture" };
async function run(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const p = spawn(process.execPath, ["node_modules/next/dist/bin/next", ...args], { cwd: root, env, stdio: "inherit" });
    p.once("exit", (code) => code === 0 ? resolve() : reject(new Error("Next.js exited " + code)));
    p.once("error", reject);
  });
}
if (process.env.KAGO_E2E_SKIP_BUILD !== "1") await run(["build", "--webpack"]);
const fixture = await createPortalDatabase();
let server: ChildProcess | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const checks: string[] = [];
async function shown(page: Page, text: string) { await page.getByText(text, { exact: true }).first().waitFor(); }
async function login(page: Page, email = "maker-one@example.test", password = fixturePassword) {
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
}
try {
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3189"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  server.stdout?.on("data", (chunk) => { output = (output + chunk).slice(-2000); });
  server.stderr?.on("data", (chunk) => { output = (output + chunk).slice(-2000); });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error("Server startup failed: " + output);
    try { if ((await fetch(base + "/ads")).ok) break; } catch { /* starting */ }
    if (i === 99) throw new Error("Server startup timed out");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
  let outage = false;
  const pageErrors: string[] = [];
  async function context() {
    const ctx = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("https://ads-fixture.invalid/**", async (route) => {
      if (outage) {
        await route.fulfill({ status: 503, contentType: "application/json", body: '{"message":"unavailable"}' });
        return;
      }
      const request = route.request();
      if (request.method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" } });
        return;
      }
      const response = await fixture.fetcher(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() });
      await route.fulfill({ status: response.status, headers: { ...Object.fromEntries(response.headers), "access-control-allow-origin": "*", "access-control-expose-headers": "x-supabase-api-version" }, body: await response.text() });
    });
    ctx.on("page", (p) => p.on("pageerror", (e) => pageErrors.push(e.message)));
    return ctx;
  }
  const ctx = await context();
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("kago-ads-session-v1", JSON.stringify({ role: "maker_staff", makerId: "M2" }));
  });
  await page.goto(base + "/ads/portal?as=maker_staff:M1");
  await shown(page, "メーカーとしてログイン");
  assert.equal(await page.getByRole("heading", { name: "募集ポータル", exact: true }).count(), 0);
  checks.push("URL・localStorageによる仮ログインで実認証を迂回できない");
  const images = new URL("../../../docs/images/", import.meta.url);
  await mkdir(images, { recursive: true });
  await page.screenshot({ path: new URL("ads01-login.png", images).pathname, fullPage: true });
  await login(page, "maker-one@example.test", "wrong-password");
  await shown(page, "メールアドレスまたはパスワードを確認してください。");
  checks.push("誤パスワードの案内");
  await login(page, "no-membership@example.test");
  await shown(page, "この役割での接続は許可されていません。");
  checks.push("メーカー所属なしの拒否");
  await login(page, "store@example.test");
  await shown(page, "この役割での接続は許可されていません。");
  checks.push("店舗担当者をメーカーとして扱わない");
  await login(page);
  await shown(page, "2件の募集");
  assert.equal(await page.getByText("秘密の下書き").count(), 0);
  assert.equal(await page.getByText("終了した募集", { exact: true }).count(), 0);
  checks.push("2店舗の公開募集、下書きと終了募集の除外");
  await page.screenshot({ path: new URL("ads01-portal.png", images).pathname, fullPage: true });
  await page.getByPlaceholder("キーワード").fill("見つからない条件");
  await shown(page, "条件に合う募集はありません。条件をゆるめるか、「終了した募集も表示」で過去の募集を確認してください。");
  await page.getByRole("button", { name: "条件をクリア" }).click();
  await shown(page, "2件の募集");
  await page.getByLabel("掲載先", { exact: true }).selectOption("app");
  await shown(page, "1件の募集");
  await page.getByRole("button", { name: "条件をクリア" }).click();
  await page.getByLabel("店舗", { exact: true }).selectOption(id(2));
  await shown(page, "1件の募集");
  await page.getByRole("button", { name: "条件をクリア" }).click();
  await page.getByLabel("カテゴリ", { exact: true }).selectOption("食品");
  await shown(page, "条件に合う募集はありません。条件をゆるめるか、「終了した募集も表示」で過去の募集を確認してください。");
  await page.getByRole("button", { name: "条件をクリア" }).click();
  await page.locator('input[type="date"]').fill("2099-02-01");
  await shown(page, "条件に合う募集はありません。条件をゆるめるか、「終了した募集も表示」で過去の募集を確認してください。");
  await page.getByRole("button", { name: "条件をクリア" }).click();
  checks.push("キーワード0件・カテゴリ・掲載先・店舗・期間終了境界の絞込み");
  await page.getByLabel("終了した募集も表示").check();
  await shown(page, "3件の募集");
  await page.getByText("終了した募集", { exact: true }).click();
  await page.getByText(/新しい申請は受け付けていません/).waitFor();
  assert.equal(await page.getByRole("link", { name: "この募集に申請する" }).count(), 0);
  checks.push("終了した募集に新規申請リンクを出さない");
  await page.goto(base + "/ads/portal/call?id=" + id(31));
  await page.getByRole("heading", { name: "パンの広告募集", exact: true }).waitFor();
  await shown(page, id(61));
  assert.equal(await page.getByText(id(62), { exact: true }).count(), 0);
  await page.getByRole("link", { name: "この募集に申請する" }).click();
  await shown(page, "この操作はDB接続の準備中です");
  checks.push("詳細・自社申請だけの表示・申請入口で未接続の保存を案内");
  await page.goto(base + "/ads/portal/call?id=" + id(33));
  await shown(page, "募集が見つかりません（下書き、または削除された募集です）");
  checks.push("下書きのUUIDを直接指定しても表示しない");
  await page.goto(base + "/ads/portal/stores");
  await page.getByText("架空2号店 駅前", { exact: true }).click();
  await shown(page, "この店舗の募集");
  checks.push("店舗一覧から店舗別の募集へ移動");
  const ctx2 = await context();
  const page2 = await ctx2.newPage();
  await page2.goto(base + "/ads/portal");
  await shown(page2, "メーカーとしてログイン");
  await login(page2, "maker-two@example.test");
  await shown(page2, "2件の募集");
  await fixture.db.query("update ad_calls set title=$1 where id=$2", ["共有DBの更新後の募集", id(34)]);
  await page.goto(base + "/ads/portal");
  await page2.reload();
  await shown(page, "共有DBの更新後の募集");
  await shown(page2, "共有DBの更新後の募集");
  checks.push("別ブラウザの2メーカーが同じDB更新を取得");
  outage = true;
  await page.reload();
  await shown(page, "認証・DBへ接続できません。時間をおいて再試行してください。");
  assert.equal(await page.getByText("共有DBの更新後の募集", { exact: true }).count(), 0);
  checks.push("接続失敗時に前の募集や仮データを表示しない");
  outage = false;
  await page.goto(base + "/ads/portal");
  await shown(page, "共有DBの更新後の募集");
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await shown(page, "メーカーとしてログイン");
  assert.equal(await page.getByText("共有DBの更新後の募集", { exact: true }).count(), 0);
  checks.push("ログアウト時に募集の表示を消す");
  await page2.setViewportSize({ width: 390, height: 844 });
  await page2.goto(base + "/ads/portal");
  await shown(page2, "共有DBの更新後の募集");
  assert.equal(await page2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  checks.push("スマホ幅でも横にはみ出さず募集を閲覧できる");
  assert.deepEqual(pageErrors, []);
  checks.push("ブラウザの未処理エラーなし");
  console.log(checks.map((s, i) => (i + 1) + ". " + s).join("\n"));
  console.log("Portal browser checks passed: " + checks.length + " (Auth/HTTP simulated; formal SQL/RLS in PGlite)");
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    console.log("Failure screen:", await page.locator("body").innerText());
    await page.screenshot({ path: "/tmp/ads01-debug.png", fullPage: true });
  }
  console.log("Fixture request paths:", fixture.requests);
  throw error;
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
  await fixture.close();
}
