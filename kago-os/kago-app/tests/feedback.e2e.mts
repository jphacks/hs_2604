import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { seedEventSuggestions } from "./fixtures/app-events.mts";
import type { AppEvent } from "../src/features/events/contracts.ts";

const fixture = await createCartBackend({ offers: true });
await seedEventSuggestions(fixture);
const base = "http://127.0.0.1:3328";
const output = resolve("../../internal/app12-evidence");
await mkdir(output, { recursive: true });
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3328",
  ],
  {
    env: {
      ...process.env,
      KAGO_NEXT_DIST_DIR: ".next/app12-e2e",
      KAGO_DEMO_ENABLED: "0",
      NEXT_PUBLIC_SUPABASE_URL: fixture.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);
let log = "";
server.stdout.on("data", (x) => {
  log += x;
});
server.stderr.on("data", (x) => {
  log += x;
});
let browser;
let activePage: import("playwright").Page | undefined;
const passed: string[] = [];
const pass = (s: string) => {
  passed.push(s);
  console.log("PASS " + s);
};
async function count(type: string) {
  return (
    await fixture.db.query<{ n: number }>(
      "select count(*)::int n from events where event_type=$1",
      [type],
    )
  ).rows[0].n;
}
async function until(check: () => Promise<boolean>) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await delay(100);
  }
  throw Error("Condition timed out");
}
await fixture.rpc("app_set_cart_item", [
  "00000000-0000-4000-8000-000000000013",
  crypto.randomUUID(),
  "00000000-0000-4000-8000-000000000020",
  1,
  0,
  "manual",
  null,
]);
try {
  for (let i = 0; i < 70; i++) {
    try {
      if ((await fetch(base + "/api/shopping")).status === 401) break;
    } catch {}
    if (i === 69 || server.exitCode !== null) throw Error(log);
    await delay(1000);
  }
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "/usr/bin/google-chrome",
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: [],
  });
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(30000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/App");
  await page.getByLabel("メールアドレス").fill("user3@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page
    .getByRole("button", { name: "前回の店舗から再開", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /買い物かごを開く/ }).click();
  await page
    .getByRole("button", { name: "検証ミルクを1点減らす", exact: true })
    .click();
  const feedback = page.getByRole("region", {
    name: "任意の削除理由",
    exact: true,
  });
  await feedback.waitFor();
  await until(async () => (await count("removal_reason_prompted")) === 1);
  const removal = (
    await fixture.db.query<{ event_id: string }>(
      "select event_id from events where event_type='cart_item_removed' order by received_at desc limit 1",
    )
  ).rows[0].event_id;
  await feedback
    .getByLabel("削除した理由（任意）", { exact: true })
    .selectOption("価格が合わない");
  await mkdir(resolve("../../docs/images"), { recursive: true });
  await page.screenshot({
    path: resolve("../../docs/images/app12-removal-feedback-mobile.png"),
    fullPage: true,
  });
  await page.route("**/api/events", async (route) => {
    const e = route.request().postDataJSON() as AppEvent;
    if (e.event_type === "removal_reason_submitted") {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await feedback
    .getByRole("button", { name: "理由を送信", exact: true })
    .click();
  await until(async () => (await count("removal_reason_submitted")) === 1);
  const row = (
    await fixture.db.query<{
      payload: { removal_event_id: string; reason: string };
    }>("select payload from events where event_type='removal_reason_submitted'")
  ).rows[0];
  assert.equal(row.payload.removal_event_id, removal);
  assert.equal(row.payload.reason, "価格が合わない");
  await page.unroute("**/api/events");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await until(
    async () =>
      !(
        await page.evaluate(() =>
          JSON.parse(
            sessionStorage.getItem(
              "kago-events:00000000-0000-4000-8000-000000000003",
            ) ?? "[]",
          ),
        )
      ).some((e: AppEvent) => e.event_type === "removal_reason_submitted"),
  );
  assert.equal(await count("removal_reason_submitted"), 1);
  pass(
    "数量1のマイナス削除で任意理由を提示し、元削除への保存と応答紛失後の再送は1件",
  );
  const close = () =>
    page
      .getByRole("dialog", { name: "買い物かご", exact: true })
      .getByRole("button", { name: "閉じる", exact: true })
      .click();
  await close();
  const add = async () => {
    const snap = await (await context.request.get(base + "/api/cart")).json();
    const response = await context.request.post(base + "/api/cart", {
      headers: { Origin: base },
      data: {
        action: "set",
        visitId: snap.visit.id,
        requestId: crypto.randomUUID(),
        expectedVersion: snap.visit.cart_version,
        productId: "00000000-0000-4000-8000-000000000020",
        quantity: 1,
        source: "manual",
      },
    });
    assert.equal(response.status(), 200);
    await page.reload();
    await page.getByRole("button", { name: /買い物かごを開く/ }).click();
  };
  await add();
  await page
    .getByRole("button", { name: "検証ミルクを削除", exact: true })
    .click();
  await feedback.waitFor();
  await feedback
    .getByRole("button", { name: "理由を入力せず続ける", exact: true })
    .click();
  await until(async () => (await count("removal_reason_skipped")) === 1);
  assert.equal(await count("removal_reason_submitted"), 1);
  pass("ごみ箱削除の理由をスキップして続行でき、本人の理由を捏造しない");
  await close();
  await add();
  await page
    .getByRole("button", { name: "検証ミルクを削除", exact: true })
    .click();
  await feedback.waitFor();
  await until(async () => (await count("removal_reason_prompted")) === 3);
  await close();
  assert.equal(await count("removal_reason_skipped"), 1);
  pass("理由欄を閉じるだけでは明示スキップや拒否としない");
  const currentCard = page.locator(
    '.shopping-stack-card[aria-hidden="false"][data-selection-item-id]',
  );
  await currentCard.first().waitFor();
  const selectedId = await currentCard
    .first()
    .getAttribute("data-selection-item-id");
  await currentCard
    .first()
    .getByRole("button", { name: "詳細を見る", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "閉じる", exact: true })
    .click();
  assert.equal(await count("recommendation_dismissed"), 0);
  const card = page.locator('[data-selection-item-id="' + selectedId + '"]');
  await card.getByRole("button", { name: "詳細を見る", exact: true }).click();
  await page
    .getByRole("button", { name: "このおすすめを非表示にする", exact: true })
    .click();
  await until(async () => (await count("recommendation_dismissed")) === 1);
  assert.equal(await card.count(), 0);
  await page.reload();
  await page.locator(".shopping-stack-card").first().waitFor();
  assert.equal(await card.count(), 0);
  pass(
    "詳細を閉じるだけでは非表示とせず、明示非表示は1件記録し再読込でも同じ選定商品を隠す",
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify({ passed }, null, 2),
  );
} catch (error) {
  console.error(await activePage?.locator("body").innerText());
  await writeFile(resolve(output, "server.log"), log);
  throw error;
} finally {
  await browser?.close();
  server.kill();
  await fixture.close();
}
