import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import {
  createPortalDatabase,
  fixturePassword,
  id,
} from "./fixtures/portal-database.mts";
import { createResultsDatabase } from "./fixtures/results-database.mts";
const root = fileURLToPath(new URL("../", import.meta.url)),
  base = "http://127.0.0.1:3347",
  images = fileURLToPath(new URL("../../../docs/images/", import.meta.url));
const env = {
  ...process.env,
  NEXT_PUBLIC_ADS_DATA_SOURCE: "supabase",
  NEXT_PUBLIC_SUPABASE_URL: "https://ads-fixture.invalid",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
};
if (process.env.KAGO_E2E_SKIP_BUILD !== "1")
  await new Promise<void>((resolve, reject) => {
    const p = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "build", "--webpack"],
      { cwd: root, env, stdio: "ignore" },
    );
    p.on("error", reject);
    p.on("exit", (n) => (n === 0 ? resolve() : reject(Error("Build failed"))));
  });
const fixture = await createPortalDatabase();
let resultFixture:
  | Awaited<ReturnType<typeof createResultsDatabase>>
  | undefined;
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3347",
  ],
  { cwd: root, env, stdio: "ignore" },
);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const checks: object[] = [],
  failures: object[] = [],
  errors: string[] = [];
async function context(fetcher: typeof fetch) {
  const ctx = await browser!.newContext({
    viewport: { width: 390, height: 844 },
    permissions: [],
  });
  await ctx.route("https://ads-fixture.invalid/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
        },
      });
      return;
    }
    const response = await fetcher(req.url(), {
      method: req.method(),
      headers: req.headers(),
      body: req.postData(),
    });
    await route.fulfill({
      status: response.status,
      headers: {
        ...Object.fromEntries(response.headers),
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "x-supabase-api-version",
      },
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  ctx.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  return ctx;
}
async function login(page: Page, store = false) {
  await page
    .getByLabel(store ? "店舗担当者" : "メーカー", { exact: true })
    .check();
  await page
    .getByLabel("メールアドレス")
    .fill(store ? "store@example.test" : "maker-one@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill(fixturePassword);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByRole("button", { name: "ログアウト", exact: true }).waitFor();
}
async function audit(page: Page, label: string, path: string) {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + path);
    if (label !== "login")
      await page
        .getByRole("button", { name: "ログアウト", exact: true })
        .waitFor();
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll('[role="status"]')].some((el) =>
          /読み込|登録方法を確認/.test(el.textContent ?? ""),
        ),
    );
    const result = await page.evaluate(() => {
      const visible = (e: Element) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const controls = [
        ...document.querySelectorAll<HTMLElement>(
          '.ads-input:not([type="checkbox"]):not([type="radio"]),button.ads-button,a.ads-button,label:has(>input[type="checkbox"]),label:has(>input[type="radio"])',
        ),
      ].filter(visible);
      return {
        viewport: innerWidth,
        scroll: document.documentElement.scrollWidth,
        small: controls
          .filter((e) => e.getBoundingClientRect().height < 43.5)
          .map((e) => ({
            tag: e.tagName,
            type: e.getAttribute("type"),
            text: (e.textContent ?? e.getAttribute("aria-label") ?? "")
              .trim()
              .slice(0, 40),
            height: e.getBoundingClientRect().height,
          })),
        clipped: controls
          .filter((e) => e.scrollWidth > e.clientWidth + 2)
          .map((e) => (e.textContent ?? "").trim().slice(0, 40)),
      };
    });
    checks.push({ label, path, width, ...result });
    if (
      result.scroll > width + 1 ||
      result.small.length ||
      result.clipped.length
    )
      failures.push({ label, path, width, ...result });
    if (
      (label === "creative" && width === 320) ||
      (label === "login" && width === 320) ||
      (label === "new-creative" && width === 390) ||
      (label === "store-form" && width === 768) ||
      (label === "applications" && width === 1280) ||
      (label === "results" && width === 390)
    )
      await page.screenshot({
        path: images + "ads-ui197-" + label + "-" + width + ".png",
        fullPage: true,
      });
  }
}
try {
  await mkdir(images, { recursive: true });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/ads")).ok) break;
    } catch {}
    if (i === 99 || server.exitCode !== null)
      throw Error("Server startup failed");
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  });
  const maker = await context(fixture.fetcher),
    page = await maker.newPage();
  await audit(page, "login", "/ads/portal");
  await login(page);
  for (const [label, path] of [
    ["home", "/ads"],
    ["portal", "/ads/portal"],
    ["stores", "/ads/portal/stores"],
    ["store-detail", "/ads/portal/store?id=" + id(1)],
    ["call", "/ads/portal/call?id=" + id(31)],
    ["creatives", "/ads/maker/creatives"],
    ["new-creative", "/ads/maker/creatives/new"],
    ["creative", "/ads/maker/creative?id=" + id(51)],
    ["applications", "/ads/maker/applications"],
    ["application", "/ads/maker/application?id=" + id(61)],
    ["new-application", "/ads/maker/applications/new?call=" + id(31)],
  ])
    await audit(page, label, path);
  const staff = await context(fixture.fetcher),
    sp = await staff.newPage();
  await sp.goto(base + "/ads/store/calls");
  await login(sp, true);
  await audit(sp, "store-calls", "/ads/store/calls");
  await audit(sp, "store-form", "/ads/store/calls/new");
  await audit(sp, "store-edit", "/ads/store/calls/edit?id=" + id(33));
  await Promise.all([maker.close(), staff.close()]);
  resultFixture = await createResultsDatabase();
  const resultContext = await context(resultFixture.fetcher),
    rp = await resultContext.newPage();
  await rp.goto(base + "/ads/maker/results");
  await login(rp);
  await audit(rp, "results", "/ads/maker/results");
  await resultContext.close();
  console.log(
    JSON.stringify({ screens: checks.length, failures, errors }, null, 2),
  );
  await writeFile(
    "/tmp/kago197-responsive.json",
    JSON.stringify({ checks, failures, errors }, null, 2),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
} finally {
  await browser?.close();
  server.kill();
  await fixture.close();
  await resultFixture?.close();
}
