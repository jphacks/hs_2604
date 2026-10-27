import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  createHeadlessBackend,
  signInBackend,
  signOutBackend,
} from "@kago/backend";
assert.equal(
  process.env.KAGO_ANALYSIS_LIVE,
  "1",
  "Explicit live-read opt-in required",
);
assert.ok(process.env.KAGO_CONNECTION_FILE);
const raw = await readFile(process.env.KAGO_CONNECTION_FILE, "utf8"),
  val = (s) => {
    try {
      return JSON.parse(s.trim());
    } catch {
      return s.trim();
    }
  };
const vars = Object.fromEntries(
  [...raw.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)].map((m) => [m[1], val(m[2])]),
);
function account(alias) {
  let active = false,
    email = "",
    password = "";
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("[")) {
      active = new RegExp("^\\[" + alias + "(?:/[^\\]]+)?\\]$").test(line);
      continue;
    }
    if (active && line.startsWith("メール = "))
      email = val(line.slice("メール = ".length));
    if (active && line.startsWith("パスワード = "))
      password = val(line.slice("パスワード = ".length));
  }
  assert.ok(email && password);
  return { email, password };
}
const root = fileURLToPath(new URL("../", import.meta.url)),
  base = "http://127.0.0.1:3299";
const config = {
    url: vars.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  },
  env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: config.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
    NEXT_PUBLIC_INSIGHT_BASE_PATH: "",
  };
delete env.KAGO_DEMO_STORE_EMAIL;
delete env.KAGO_DEMO_STORE_PASSWORD;
delete env.KAGO_SALES_RECORDING_COVERAGE;
let server, browser;
const clients = [];
async function poll(fn) {
  for (let i = 0; i < 150; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw Error("Condition timed out");
}
async function start(mode) {
  env.NEXT_PUBLIC_INSIGHT_DATA_SOURCE = mode;
  await new Promise((resolve, reject) => {
    const p = spawn(
      process.execPath,
      [root + "node_modules/next/dist/bin/next", "build"],
      { cwd: root, env, stdio: "ignore" },
    );
    p.on("error", reject);
    p.on("exit", (n) => (n === 0 ? resolve() : reject(Error("Build failed"))));
  });
  server = spawn(
    process.execPath,
    [
      root + "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3299",
    ],
    { cwd: root, env, stdio: "ignore" },
  );
  await poll(async () => {
    if (server.exitCode !== null) throw Error("Server exited");
    try {
      return (await fetch(base + "/login")).ok;
    } catch {
      return false;
    }
  });
}
async function stop() {
  if (server?.exitCode === null)
    await new Promise((resolve) => {
      server.once("exit", resolve);
      server.kill();
    });
}
async function loginClient(alias) {
  const c = createHeadlessBackend(config);
  clients.push(c);
  const a = account(alias);
  await signInBackend(c, a.email, a.password);
  return c;
}
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
    headless: true,
  });
  await start("mock");
  const context = await browser.newContext({
      viewport: { width: 1280, height: 1000 },
      permissions: [],
    }),
    page = await context.newPage();
  await page.goto(
    base + "/analysis?from=2026-10-25&to=2026-10-26&origin=synthetic",
  );
  await page
    .getByRole("heading", { name: "商品とおすすめの詳細分析", exact: true })
    .waitFor();
  await page.getByText("50.0%", { exact: true }).waitFor();
  await page.getByText("固定例のトマト", { exact: true }).waitFor();
  for (const text of [
    "本人の理由入力あり：1件",
    "未設定（明示スキップ）：1件",
    "提示後に入力記録なし：1件",
    "提示記録なし（未収集・未到達）：1件",
  ])
    await page.getByText(text, { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("img", { name: "0時から23時の時間帯別販売点数", exact: true })
      .count(),
    1,
  );
  const images = fileURLToPath(
    new URL("../../../docs/images/", import.meta.url),
  );
  await mkdir(images, { recursive: true });
  await page.screenshot({
    path: images + "ins05-analysis-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({
    path: images + "ins05-analysis-mobile.png",
    fullPage: true,
  });
  console.log(
    "PASS fixed_ranking_hourly_chart_50_percent_four_feedback_states_and_mobile",
  );
  await page.getByLabel("記録の種類", { exact: true }).selectOption("operated");
  await page.getByRole("button", { name: "集計を表示", exact: true }).click();
  await page
    .getByText("表示を記録した選定商品枠がありません。追加率は算出しません。", {
      exact: true,
    })
    .waitFor();
  assert.equal(await page.getByText("50.0%", { exact: true }).count(), 0);
  console.log("PASS missing_records_not_measured_zero_or_rate");
  await context.close();
  await stop();
  const a = await loginClient("T1"),
    b = await loginClient("T2"),
    maker = await loginClient("M1");
  const member = await a.from("store_members").select("store_id").single();
  assert.ifError(member.error);
  const sid = member.data.store_id;
  const args = {
    p_start: new Date(Date.now() - 7 * 86400000).toISOString(),
    p_end: new Date().toISOString(),
    p_store_id: sid,
    p_origin: "operated",
  };
  const result = await a.rpc("kago_detailed_insight", args);
  assert.ifError(result.error);
  assert.ok(Array.isArray(result.data.methods));
  const serialized = JSON.stringify(result.data);
  for (const field of ["user_id", "visit_id", "event_id", "selection_item_id"])
    assert.ok(!serialized.includes(field));
  for (const c of [b, maker])
    assert.equal(
      (await c.rpc("kago_detailed_insight", args)).error?.code,
      "42501",
    );
  console.log(
    "PASS shared_own_store_aggregate_no_identifiers_other_store_and_maker_denied",
  );
  await start("supabase");
  const own = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      permissions: [],
    }),
    p = await own.newPage();
  await p.goto(base + "/analysis");
  await p.locator('input[name="email"]').fill(account("T1").email);
  await p.locator('input[name="password"]').fill(account("T1").password);
  await p.getByRole("button", { name: "ログイン", exact: true }).click();
  await p
    .getByRole("heading", { name: "商品とおすすめの詳細分析", exact: true })
    .waitFor();
  await p
    .getByRole("heading", { name: "比較と削除理由の記録", exact: true })
    .waitFor();
  assert.equal(
    await p
      .getByText(
        "詳細集計を取得できません。通信・自店への所属・集計APIの適用状況を確認してください。販売0件や拒否なしとは扱いません。",
        { exact: true },
      )
      .count(),
    0,
  );
  assert.ok(
    !(await p.locator("body").innerText()).includes("固定例の合成データです"),
  );
  await p.getByRole("link",{name:"販売推移",exact:true}).click();
  await p.getByRole("heading",{name:"販促商品の販売推移",exact:true}).waitFor();
  await p.getByRole("link",{name:"詳細分析",exact:true}).click();
  await p.getByRole("heading",{name:"商品とおすすめの詳細分析",exact:true}).waitFor();
  const anonymous = await browser.newContext({ permissions: [] }),
    anon = await anonymous.newPage();
  await anon.goto(base + "/analysis");
  await anon.getByRole("button", { name: "ログイン", exact: true }).waitFor();
  assert.equal(
    await anon
      .getByRole("img", { name: "0時から23時の時間帯別販売点数", exact: true })
      .count(),
    0,
  );
  await Promise.all([own.close(), anonymous.close()]);
  console.log("PASS real_login_returns_to_analysis_and_anonymous_denied");
} catch (error) {
  let message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  const secrets = [
    ...Object.values(vars),
    ...[...raw.matchAll(/^(?:メール|パスワード) = (.+)$/gm)].map((m) =>
      val(m[1]),
    ),
  ].filter((s) => typeof s === "string" && s.length >= 6);
  for (const s of secrets) message = message.split(s).join("[redacted]");
  console.error(message.replace(/https?:\/\/\S+/g, "[URL]"));
  process.exitCode = 1;
} finally {
  await browser?.close();
  await stop();
  await Promise.all(clients.map((c) => signOutBackend(c).catch(() => {})));
}
