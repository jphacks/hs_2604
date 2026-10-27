import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  createHeadlessBackend,
  getBackendIdentity,
  signInBackend,
  signOutBackend,
} from "@kago/backend";
import { createSupabaseMakerRepository } from "../src/lib/backend/maker.ts";
import {
  createSupabaseStoreCallsRepository,
  requireStore,
} from "../src/lib/backend/store-calls.ts";

assert.equal(
  process.env.KAGO_ADS_LIFECYCLE,
  "1",
  "Explicit shared-loop opt-in required",
);
assert.ok(process.env.KAGO_CONNECTION_FILE, "Private connection file required");
const text = await readFile(process.env.KAGO_CONNECTION_FILE, "utf8");
const value = (s) => {
  try {
    return JSON.parse(s.trim());
  } catch {
    return s.trim();
  }
};
const settings = Object.fromEntries(
  [...text.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)].map((m) => [
    m[1],
    value(m[2]),
  ]),
);
function credential(alias) {
  let active = false,
    email = "",
    password = "";
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("[")) {
      active = new RegExp("^\\[" + alias + "(?:/[^\\]]+)?\\]$").test(line);
      continue;
    }
    if (active && line.startsWith("メール = "))
      email = value(line.slice("メール = ".length));
    if (active && line.startsWith("パスワード = "))
      password = value(line.slice("パスワード = ".length));
  }
  assert.ok(email && password, "Missing account " + alias);
  return { email, password };
}
const adsRoot = fileURLToPath(new URL("../", import.meta.url));
const insightRoot = fileURLToPath(
  new URL("../../kago-insight/", import.meta.url),
);
const config = {
  url: settings.NEXT_PUBLIC_SUPABASE_URL,
  publishableKey: settings.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: config.url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
  NEXT_PUBLIC_ADS_DATA_SOURCE: "supabase",
  NEXT_PUBLIC_INSIGHT_DATA_SOURCE: "supabase",
  NEXT_PUBLIC_SIGNAGE_CROWD_SELECTION: "0",
  NEXT_PUBLIC_INSIGHT_BASE_PATH: "",
  KAGO_DEMO_ENABLED: "0",
};
delete env.KAGO_DEMO_STORE_EMAIL;
delete env.KAGO_DEMO_STORE_PASSWORD;
const insight = "http://127.0.0.1:3342",
  ads = "http://127.0.0.1:3343";
const servers = [],
  clients = [],
  report = { status: "running", checks: [], ids: {} };
let browser, callId, applicationId, storeSession;
const output = process.env.KAGO_ADS_LIFECYCLE_REPORT ?? "/tmp/kago31-live.json";
async function persist() {
  await writeFile(output, JSON.stringify(report, null, 2), { mode: 0o600 });
}
async function pass(label) {
  report.checks.push(label);
  await persist();
  console.log("PASS " + label);
}
async function login(alias) {
  const c = createHeadlessBackend(config);
  clients.push(c);
  const who = credential(alias);
  await signInBackend(c, who.email, who.password);
  return c;
}
async function poll(fn) {
  for (let i = 0; i < 150; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw Error("Condition timed out");
}
async function build(root) {
  await new Promise((resolve, reject) => {
    const p = spawn(
      process.execPath,
      [root + "node_modules/next/dist/bin/next", "build", "--webpack"],
      { cwd: root, env, stdio: "ignore" },
    );
    p.on("error", reject);
    p.on("exit", (n) =>
      n === 0 ? resolve() : reject(Error("Production build failed")),
    );
  });
}
async function serve(root, port, path) {
  const p = spawn(
    process.execPath,
    [
      root + "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { cwd: root, env, stdio: "ignore" },
  );
  servers.push(p);
  await poll(async () => {
    if (p.exitCode !== null) throw Error("Server exited");
    try {
      return (await fetch("http://127.0.0.1:" + port + path)).status < 500;
    } catch {
      return false;
    }
  });
}

const maker = await login("M1"),
  other = await login("M2"),
  store = await login("T1");
const makerRepo = createSupabaseMakerRepository(maker),
  otherRepo = createSupabaseMakerRepository(other),
  storeRepo = createSupabaseStoreCallsRepository(store);
try {
  const staff = await requireStore(store);
  assert.equal(staff.storeIds.length, 1);
  storeSession = { role: "store_staff", storeId: staff.storeIds[0] };
  const sessionOf = async (c) => {
    const identity = await getBackendIdentity(c, "maker_staff");
    const m = await c
      .from("maker_members")
      .select("maker_id")
      .eq("user_id", identity.userId);
    assert.ifError(m.error);
    assert.equal(m.data.length, 1);
    return { role: "maker_staff", makerId: m.data[0].maker_id };
  };
  const makerSession = await sessionOf(maker),
    otherSession = await sessionOf(other);
  assert.notEqual(makerSession.makerId, otherSession.makerId);
  const product = await store
    .from("products")
    .select("id,category")
    .eq("code", "2900000000162")
    .single();
  assert.ifError(product.error);
  const starts = new Date(Date.now() - 60000).toISOString(),
    ends = new Date(Date.now() + 1800000).toISOString(),
    headline = "ADS31 lifecycle " + new Date().toISOString(),
    reason = "ADS31 検証：コピーを修正してください";
  const input = {
    channels: ["app", "signage"],
    requested_start: starts,
    requested_end: ends,
    message: "ADS31 専用検証",
  };
  const call = await storeRepo.saveAdCall(storeSession, {
    title: headline,
    description: "ADS-03専用、検証後終了",
    categories: [product.data.category],
    channels: input.channels,
    starts_at: starts,
    ends_at: ends,
    disclosure_scope: ["impressions", "clicks", "cart_adds", "purchases"],
  });
  callId = call.id;
  report.ids.call = callId;
  await persist();
  await storeRepo.setAdCallStatus(
    storeSession,
    callId,
    "open",
    call.updated_at,
  );
  const asset = async (file) => {
    const bytes = await readFile(
      new URL("../public/ad-assets/design-v2/" + file, import.meta.url),
    );
    return {
      kind: "image",
      path: "blob:" + file,
      upload: new Blob([bytes], { type: "image/png" }),
      width: 0,
      height: 0,
      bytes: bytes.length,
      file_name: file,
    };
  };
  const content = async (version, design) => ({
    headline: headline + " v" + version,
    note: "ADS31 lifecycle only",
    assets: {
      app: await asset("CR1_v" + design + "_app.png"),
      signage: await asset("CR1_v" + design + "_signage.png"),
    },
  });
  const created = await makerRepo.createCreative(
    makerSession,
    { product_id: product.data.id, ...(await content(1, 3)) },
    randomUUID(),
  );
  const creativeId = created.creative.id;
  report.ids.creative = creativeId;
  let application = await makerRepo.submitApplication(makerSession, callId, {
    ...input,
    creative_version_id: created.versions[0].id,
  });
  applicationId = application.id;
  report.ids.application = applicationId;
  await persist();
  await assert.rejects(
    makerRepo.resubmitApplication(
      makerSession,
      applicationId,
      { ...input, creative_version_id: created.versions[0].id },
      application.updated_at,
    ),
  );
  assert.ok(!(await otherRepo.getApplication(otherSession, applicationId)));
  const forged = await maker
    .from("ad_applications")
    .update({ status: "approved" })
    .eq("id", applicationId)
    .select("id");
  assert.ok(forged.error || forged.data.length === 0);
  application = await makerRepo.getApplication(makerSession, applicationId);
  assert.equal(application.status, "submitted");
  await pass(
    "two_media_registration_pending_retry_denied_other_maker_denied_direct_approval_denied",
  );
  if (process.env.KAGO_E2E_SKIP_BUILD !== "1")
    await Promise.all([build(adsRoot), build(insightRoot)]);
  await Promise.all([
    serve(adsRoot, 3343, "/ads/login"),
    serve(insightRoot, 3342, "/login"),
  ]);
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
    headless: true,
  });
  const staffContext = await browser.newContext({ permissions: [] }),
    rp = await staffContext.newPage();
  await rp.goto(insight + "/review");
  await rp.locator('input[name="email"]').fill(credential("T1").email);
  await rp.locator('input[name="password"]').fill(credential("T1").password);
  await rp.getByRole("button", { name: "ログイン", exact: true }).click();
  await rp.locator('input[name="email"]').waitFor({ state: "hidden" });
  const select = async (title) => {
    await rp.goto(insight + "/review");
    await rp.getByRole("button").filter({ hasText: title }).first().click();
  };
  await select(headline + " v1");
  await rp.getByRole("button", { name: "却下する", exact: true }).click();
  await rp.getByLabel("却下する理由（必須）", { exact: true }).fill(reason);
  await rp.getByRole("button", { name: "この理由で却下", exact: true }).click();
  await poll(async () => {
    const a = await makerRepo.getApplication(makerSession, applicationId);
    return a.status === "rejected" && a;
  });
  const v2 = await makerRepo.addCreativeVersion(
    makerSession,
    creativeId,
    await content(2, 4),
    randomUUID(),
  );
  application = await makerRepo.getApplication(makerSession, applicationId);
  application = await makerRepo.resubmitApplication(
    makerSession,
    applicationId,
    { ...input, creative_version_id: v2.id },
    application.updated_at,
  );
  assert.equal(application.revisions.length, 2);
  assert.equal(application.revisions[0].status, "rejected");
  assert.equal(application.revisions[0].review_comment, reason);
  assert.equal(application.revisions[1].rev, 2);
  assert.equal(application.status, "submitted");
  await pass(
    "insight_ui_rejection_new_image_same_application_revision_2_history_preserved",
  );
  const manufacturer = await browser.newContext({
      viewport: { width: 390, height: 844 },
      permissions: [],
    }),
    mp = await manufacturer.newPage();
  await mp.goto(ads + "/ads/maker/application?id=" + applicationId);
  await mp.getByLabel("メールアドレス").fill(credential("M1").email);
  await mp
    .getByLabel("パスワード", { exact: true })
    .fill(credential("M1").password);
  await mp.getByRole("button", { name: "ログイン", exact: true }).click();
  await mp.getByRole("button", { name: "ログアウト", exact: true }).waitFor();
  await mp.goto(ads + "/ads/maker/application?id=" + applicationId);
  await mp
    .getByText("店舗のコメント：" + reason, { exact: true })
    .first()
    .waitFor();
  await pass("maker_real_login_displays_rejection_history_after_resubmission");
  let currentVersion = v2.id;
  const approve = async (title) => {
    await select(title);
    await rp.getByRole("button", { name: "承認する", exact: true }).click();
    await rp
      .getByRole("button", { name: "この内容で承認", exact: true })
      .click();
    return poll(async () => {
      const r = await store
        .from("ad_placements")
        .select("id,revision,creative_version_id,status")
        .eq("application_id", applicationId)
        .eq("status", "active");
      assert.ifError(r.error);
      return r.data.find((p) => p.creative_version_id === currentVersion);
    });
  };
  const first = await approve(headline + " v2");
  assert.equal(first.revision, 2);
  await pass("insight_ui_approval_revision_2_creates_exact_version_placement");
  const v3 = await makerRepo.addCreativeVersion(
    makerSession,
    creativeId,
    await content(3, 3),
    randomUUID(),
  );
  application = await makerRepo.getApplication(makerSession, applicationId);
  application = await makerRepo.resubmitApplication(
    makerSession,
    applicationId,
    { ...input, creative_version_id: v3.id },
    application.updated_at,
  );
  assert.equal(application.revisions.length, 3);
  let old = await store
    .from("ad_placements")
    .select("status")
    .eq("id", first.id)
    .single();
  assert.ifError(old.error);
  assert.equal(old.data.status, "active");
  currentVersion = v3.id;
  const second = await approve(headline + " v3");
  assert.equal(second.revision, 3);
  old = await store
    .from("ad_placements")
    .select("status")
    .eq("id", first.id)
    .single();
  assert.ifError(old.error);
  assert.equal(old.data.status, "superseded");
  application = await makerRepo.getApplication(makerSession, applicationId);
  assert.deepEqual(
    application.revisions.map((r) => r.status),
    ["rejected", "approved", "approved"],
  );
  const creatives = await makerRepo.listMyCreatives(makerSession),
    stored = creatives.find((c) => c.creative.id === creativeId);
  assert.equal(stored.versions.length, 3);
  for (const v of stored.versions) assert.ok(v.assets.app && v.assets.signage);
  await mp.reload();
  await mp
    .getByText("店舗のコメント：" + reason, { exact: true })
    .first()
    .waitFor();
  await pass(
    "approved_new_version_requires_revision_3_approval_old_placement_preserved_then_superseded_all_versions_retained",
  );
  report.status = "passed";
  await persist();
} catch (error) {
  report.status = "failed";
  let message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  const secrets = [
    ...Object.values(settings),
    ...[...text.matchAll(/^(?:メール|パスワード) = (.+)$/gm)].map((m) =>
      value(m[1]),
    ),
  ].filter((v) => typeof v === "string" && v.length >= 6);
  for (const secret of secrets)
    message = message.split(secret).join("[redacted]");
  console.error(message.replace(/https?:\/\/\S+/g, "[URL]"));
  process.exitCode = 1;
} finally {
  try {
    if (applicationId) {
      const pending = await store
        .from("ad_applications")
        .select("status,revision")
        .eq("id", applicationId)
        .single();
      assert.ifError(pending.error);
      if (pending.data.status === "submitted") {
        const result = await store.rpc("kago_reject_application", {
          p_application_id: applicationId,
          p_expected_revision: pending.data.revision,
          p_reason:
            "ADS31 自動検証の終了処理。実際の広告内容の評価ではありません。",
        });
        assert.ifError(result.error);
      }

      const active = await store
        .from("ad_placements")
        .select("id")
        .eq("application_id", applicationId)
        .eq("status", "active");
      assert.ifError(active.error);
      for (const p of active.data) {
        const r = await store.rpc("kago_suspend_placement", {
          p_placement_id: p.id,
          p_reason: "ADS31 検証終了",
        });
        assert.ifError(r.error);
      }
    }
    if (callId) {
      const latest = await storeRepo.getAdCall(storeSession, callId);
      if (latest.status === "open")
        await storeRepo.setAdCallStatus(
          storeSession,
          callId,
          "closed",
          latest.updated_at,
        );
    }
    report.cleanup =
      "dedicated call closed; remaining active placements suspended; versions/history retained";
  } finally {
    await persist();
    await browser?.close();
    await Promise.all(clients.map((c) => signOutBackend(c).catch(() => {})));
    for (const p of servers) if (p.exitCode === null) p.kill();
  }
}
