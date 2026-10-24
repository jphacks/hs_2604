import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { createShoppingFixture, uuid } from "./fixtures/shopping-backend.mjs";

// Verify the real-connection checker itself without credentials or a shared DB.
async function run(env: Record<string, string | undefined>) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", "scripts/check-shopping.mts"], {
      cwd: new URL("..", import.meta.url), env: { ...process.env, ...env }, windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    child.on("error", reject);
    child.on("exit", code => resolve({ code, output }));
  });
}

function env(url: string, allowWrites = false): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    KAGO_CHECK_STORE_ID: uuid(1), KAGO_CHECK_CUSTOMER_A_EMAIL: "user3@example.test",
    KAGO_CHECK_CUSTOMER_A_PASSWORD: "fixture-password", KAGO_CHECK_CUSTOMER_B_EMAIL: "user4@example.test",
    KAGO_CHECK_CUSTOMER_B_PASSWORD: "fixture-password", KAGO_CHECK_ALLOW_VISIT_WRITE: allowWrites ? "1" : "0",
  };
}

test("live checker defaults to read-only, verifies two users and hides credentials", async () => {
  const fixture = await createShoppingFixture();
  try {
    const result = await run(env(fixture.url));
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /5項目成功/);
    assert.match(result.output, /書込み項目は未実施/);
    assert.equal(fixture.state.calls.filter(call => call.path.endsWith("/rpc/app_start_visit")).length, 0);
    for (const value of ["fixture-password", "user3@example.test", "user4@example.test", "sb_publishable_fixture", uuid(3), uuid(4)]) assert.ok(!result.output.includes(value));
  } finally { await fixture.close(); }
});

test("explicit test-account opt-in verifies restart and the same request's retry", async () => {
  const fixture = await createShoppingFixture();
  try {
    const result = await run(env(fixture.url, true));
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /7項目成功/);
    assert.match(result.output, /書込み検証あり/);
    assert.equal(fixture.state.calls.filter(call => call.path.endsWith("/rpc/app_start_visit")).length, 6);
  } finally { await fixture.close(); }
});

test("missing DB fails with a safe actionable message rather than reporting completion", async () => {
  const fixture = await createShoppingFixture();
  fixture.state.dbError = "42P01";
  try {
    const result = await run(env(fixture.url));
    assert.equal(result.code, 1);
    assert.match(result.output, /DB-06の権限・RLS/);
    assert.ok(!result.output.includes("PRIVATE SQL"));
    assert.ok(!result.output.includes("項目成功"));
  } finally { await fixture.close(); }
});

test("missing configuration stops before attempting any connection", async () => {
  const result = await run({ KAGO_CHECK_STORE_ID: "" });
  assert.equal(result.code, 1);
  assert.match(result.output, /KAGO_CHECK_STORE_ID/);
  assert.ok(!result.output.includes("項目成功"));
});
