import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { createPortalDatabase, fixturePassword } from "../../kago-ads/tests/fixtures/portal-database.mts";

const appRoot = new URL("../", import.meta.url).pathname;
const adsRoot = new URL("../../kago-ads/", import.meta.url).pathname;
const base = "http://127.0.0.1:3205";
const adsOrigin = "http://127.0.0.1:3003";
const backendUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://ads-fixture.invalid";
const env = { ...process.env, ADS_ORIGIN: adsOrigin, NEXT_PUBLIC_ADS_DATA_SOURCE: "supabase",
  NEXT_PUBLIC_SUPABASE_URL: backendUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_fixture" };

async function build(cwd: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("pnpm", args, { cwd, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Build failed: ${code}`)));
  });
}
if (process.env.KAGO_E2E_SKIP_BUILD !== "1") {
  await build(adsRoot, ["build", "--webpack"]);
  await build(appRoot, ["build", "--webpack"]);
}

const servers: ChildProcess[] = [];
async function start(cwd: string, port: number, path: string) {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  servers.push(child);
  let output = "";
  child.stdout?.on("data", chunk => { output = (output + chunk).slice(-2000); });
  child.stderr?.on("data", chunk => { output = (output + chunk).slice(-2000); });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Server stopped: ${output}`);
    try { if ((await fetch(`http://127.0.0.1:${port}${path}`)).ok) return; } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("Server startup timed out");
}

const fixture = await createPortalDatabase();
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await start(adsRoot, 3003, "/ads");
  await start(appRoot, 3205, "/ads");
  for (const path of ["/", "/App", "/insight", "/ads", "/ads/maker/results", "/ads/store/calls"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    if (path === "/") assert.match(await response.text(), /href="\/ads"/);
  }
  const image = await fetch(base + "/ad-assets/CR1_v1_app.png");
  assert.equal(image.status, 200);
  assert.match(image.headers.get("content-type") ?? "", /^image\/png/);

  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // Every browser request outside the local applications is intercepted. Auth and
  // PostgREST use the existing disposable DB fixture; shared business data is untouched.
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === new URL(base).origin || url.origin === adsOrigin) return route.continue();
    if (url.origin !== new URL(backendUrl).origin) return route.abort();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: {
      "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,OPTIONS" } });
    const response = await fixture.fetcher(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() });
    await route.fulfill({ status: response.status, headers: { ...Object.fromEntries(response.headers), "access-control-allow-origin": "*" }, body: Buffer.from(await response.arrayBuffer()) });
  });
  const customerCookie = `sb-${new URL(backendUrl).hostname.split(".")[0]}-auth-token`;
  const preserved = [
    { name: customerCookie, value: "customer-session-sentinel", url: base },
    { name: "kago-insight-auth", value: "insight-session-sentinel", url: base },
  ];
  await context.addCookies(preserved);
  const page = await context.newPage();
  const errors: string[] = [], badAssets: string[] = [];
  const loadedAssets = new Set<string>();
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    const path = new URL(response.url()).pathname;
    if (!path.startsWith("/ads-static/")) return;
    loadedAssets.add(path);
    if (response.status() >= 400) badAssets.push(`${path}: ${response.status()}`);
  });
  await page.goto(base + "/ads/portal?public_path_check=205");
  await page.getByText("メーカーとしてログイン", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).origin, base);
  assert.equal(new URL(page.url()).searchParams.get("public_path_check"), "205");
  const images = new URL("../../../docs/images/", import.meta.url);
  await mkdir(images, { recursive: true });
  await page.screenshot({ path: new URL("ads-public-path-login.png", images).pathname, fullPage: true });
  await page.getByLabel("メールアドレス").fill("maker-one@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill(fixturePassword);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.getByText("2件の募集", { exact: true }).waitFor();
  const loggedIn = await context.cookies();
  assert(loggedIn.some(cookie => cookie.name.startsWith("kago-ads-auth")));
  for (const cookie of preserved) assert.equal(loggedIn.find(c => c.name === cookie.name)?.value, cookie.value);
  for (const [name, path] of [["広告素材", "/ads/maker/creatives"], ["申請一覧", "/ads/maker/applications"], ["広告の成果", "/ads/maker/results"]]) {
    await page.getByRole("link", { name, exact: true }).first().click();
    await page.waitForURL(base + path);
    await page.getByRole("button", { name: "ログアウト", exact: true }).waitFor();
    await page.reload();
    await page.getByRole("button", { name: "ログアウト", exact: true }).waitFor();
  }
  await page.goto(base + "/ads/portal");
  await page.getByText("2件の募集", { exact: true }).waitFor();
  await page.screenshot({ path: new URL("ads-public-path-portal.png", images).pathname, fullPage: true });
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await page.getByText("メーカーとしてログイン", { exact: true }).waitFor();
  const loggedOut = await context.cookies();
  for (const cookie of preserved) assert.equal(loggedOut.find(c => c.name === cookie.name)?.value, cookie.value);
  assert(loadedAssets.size > 0);
  assert([...loadedAssets].some(path => path.endsWith(".css")));
  assert.deepEqual(badAssets, []);
  assert.deepEqual(errors, []);
  console.log("PASS: public paths, CSS/JS/image, query, login, navigation, reload, logout and independent App/Insight cookies");
} finally {
  await browser?.close();
  for (const server of servers) server.kill("SIGTERM");
  await fixture.close();
}
