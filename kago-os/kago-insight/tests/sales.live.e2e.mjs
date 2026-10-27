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
  process.env.KAGO_SALES_LIVE,
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
  base = "http://127.0.0.1:3298";
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
      "3298",
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
  const mock = await browser.newContext({
      viewport: { width: 1280, height: 1000 },
      permissions: [],
    }),
    p = await mock.newPage();
  await p.goto(base + "/sales?from=2026-10-25&to=2026-10-26&origin=synthetic");
  await p
    .getByRole("heading", { name: "販促商品の販売推移", exact: true })
    .waitFor();
  await p
    .getByText("固定例の合成データです。共有DBの実績ではありません。", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await p.getByRole("img", { name: /記録範囲が未確認/ }).count(),
    2,
  );
  assert.equal(await p.getByText("+100.0%", { exact: true }).count(), 2);
  const images = fileURLToPath(
    new URL("../../../docs/images/", import.meta.url),
  );
  await mkdir(images, { recursive: true });
  await p.screenshot({ path: images + "ins08-sales-mock.png", fullPage: true });
  console.log("PASS fixed_known_coverage_quantity_amount_delta_and_graphs");
  await p.getByLabel("区切り", { exact: true }).selectOption("hour");
  await p.getByRole("button", { name: "販売推移を表示", exact: true }).click();
  await p.getByText("+100.0%", { exact: true }).first().waitFor();
  assert.equal(new URL(p.url()).searchParams.get("bucket"), "hour");
  console.log("PASS hourly_filter_preserves_equal_period_comparison");
  await p.goto(base + "/sales?from=2026-10-25&to=2026-10-26&origin=operated");
  await p
    .getByText("比較できません（販売の記録範囲が未確認です）。", {
      exact: true,
    })
    .waitFor();
  assert.ok(!(await p.getByRole("table").first().innerText()).includes("%"));
  await p.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await p.screenshot({
    path: images + "ins08-sales-mobile.png",
    fullPage: true,
  });
  console.log("PASS missing_records_no_zero_rate_and_mobile_layout");
  await mock.close();
  await stop();
  const a = await loginClient("T1"),
    b = await loginClient("T2"),
    maker = await loginClient("M1");
  const member = await a.from("store_members").select("store_id").single();
  assert.ifError(member.error);
  const sid = member.data.store_id;
  const product = await a
    .from("products")
    .select("id")
    .eq("code", "2900000000056")
    .single();
  assert.ifError(product.error);
  const args = {
    p_store_id: sid,
    p_product_ids: [product.data.id],
    p_start: new Date(Date.now() - 31 * 86400000).toISOString(),
    p_end: new Date().toISOString(),
    p_bucket: "day",
  };
  const sales = await a.rpc("kago_product_sales", args);
  assert.ifError(sales.error);
  assert.ok(
    sales.data.some(
      (r) => r.data_origin === "operated" && Number(r.quantity) > 0,
    ),
  );
  for (const c of [b, maker])
    assert.equal(
      (await c.rpc("kago_product_sales", args)).error?.code,
      "42501",
    );
  assert.ok(
    sales.data.every(
      (r) =>
        !Object.keys(r).some((k) =>
          ["user_id", "visit_id", "order_id"].includes(k),
        ),
    ),
  );
  console.log(
    "PASS real_sales_api_operated_rows_without_personal_ids_other_store_and_maker_denied",
  );
  const parents = await a
    .from("store_promotions")
    .select("id")
    .eq("store_id", sid);
  assert.ifError(parents.error);
  const versions = await a
    .from("promotion_versions")
    .select("id")
    .in(
      "promotion_id",
      parents.data.map((r) => r.id),
    )
    .order("created_at", { ascending: false })
    .limit(1);
  assert.ifError(versions.error);
  assert.equal(versions.data.length, 1);
  const selected = versions.data[0].id;
  await start("supabase");
  const own = await browser.newContext({ permissions: [] }),
    page = await own.newPage();
  await page.goto(base + "/sales?promotion=" + selected);
  await page.locator('input[name="email"]').fill(account("T1").email);
  await page.locator('input[name="password"]').fill(account("T1").password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page
    .getByRole("heading", { name: "販促商品の販売推移", exact: true })
    .waitFor({ timeout: 45000 });
  await page
    .getByText("比較できません（販売の記録範囲が未確認です）。", {
      exact: true,
    })
    .waitFor();
  assert.ok(!(await page.getByRole("table").first().innerText()).includes("%"));
  assert.ok(
    !(await page.locator("body").innerText()).includes(
      "固定例の合成データです",
    ),
  );
  console.log(
    "PASS real_store_sales_screen_without_unverified_comparison_claims",
  );
  const foreign = await browser.newContext({ permissions: [] }),
    other = await foreign.newPage();
  await other.goto(base + "/sales?promotion=" + selected);
  await other.locator('input[name="email"]').fill(account("T2").email);
  await other.locator('input[name="password"]').fill(account("T2").password);
  await other.getByRole("button", { name: "ログイン", exact: true }).click();
  await other
    .getByRole("heading", { name: "販促商品の販売推移", exact: true })
    .waitFor();
  await other
    .getByText("この店舗で確認できる販促を選んでください。", { exact: true })
    .waitFor();
  assert.ok(
    !(await other
      .getByLabel("販促", { exact: true })
      .locator("option")
      .evaluateAll((opts, id) => opts.some((o) => o.value === id), selected)),
  );
  console.log("PASS other_store_promotion_id_cannot_be_selected_or_reported");
  await Promise.all([own.close(), foreign.close()]);
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
