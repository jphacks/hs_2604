import assert from "node:assert/strict";
import test from "node:test";
import {
  BackendError, backendErrorStatus, checkBackendConnection, createHeadlessBackend,
  createServerBackend, getBackendIdentity, readBackendConfig, signInBackend,
  signOutBackend, toBackendError, type BackendRole,
} from "../src/index.ts";

const config = { url: "https://demo.supabase.co", publishableKey: "sb_publishable_test" };
const deviceId = "00000000-0000-4000-8000-000000000001";
const storeId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";
const hasCode = (code: string) => (error: unknown) => error instanceof BackendError && error.code === code;

function fixture(role: BackendRole = "customer", options: {
  metadata?: Record<string, unknown>;
  userMetadata?: Record<string, unknown>;
  userError?: { code: string; status: number; message?: string };
  loginError?: boolean;
  databaseError?: string;
  databaseResult?: boolean;
  refreshError?: boolean;
} = {}) {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const user = {
    id: userId, aud: "authenticated", created_at: "2026-10-24T00:00:00Z",
    app_metadata: options.metadata ?? { kago: { roles: [role], ...(role === "signage" ? { device_id: deviceId, store_id: storeId } : {}) } },
    user_metadata: options.userMetadata ?? {},
  };
  const token = [
    { alg: "HS256", typ: "JWT" },
    { sub: userId, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 },
  ].map((part) => Buffer.from(JSON.stringify(part)).toString("base64url")).join(".") + ".signature";
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    requests.push({ url, init });
    if (url.pathname.endsWith("/token")) {
      if (options.refreshError && url.searchParams.get("grant_type") === "refresh_token") {
        return Response.json({ code: "refresh_token_not_found", msg: "PRIVATE" }, { status: 400, headers: { "X-Supabase-Api-Version": "2024-01-01" } });
      }
      if (options.loginError) return Response.json({ code: "invalid_credentials", msg: "PRIVATE provider details" }, { status: 400, headers: { "X-Supabase-Api-Version": "2024-01-01" } });
      return Response.json({ access_token: token, token_type: "bearer", refresh_token: "private-refresh", expires_in: 3600, user });
    }
    if (url.pathname.endsWith("/user")) {
      if (options.userError) return Response.json({ code: options.userError.code, msg: options.userError.message ?? "PRIVATE" }, { status: options.userError.status, headers: { "X-Supabase-Api-Version": "2024-01-01" } });
      return Response.json(user);
    }
    if (url.pathname.endsWith("/logout")) return new Response(null, { status: 204 });
    if (url.pathname.endsWith("/rpc/kago_connection_check")) {
      if (options.databaseError) return Response.json({ code: options.databaseError, message: "PRIVATE SQL details" }, { status: 404 });
      return Response.json(options.databaseResult ?? true);
    }
    throw new Error(`Unexpected test request: ${url.pathname}`);
  };
  return { client: createHeadlessBackend(config, fetcher), requests, fetcher };
}

test("missing configuration and malformed URLs are distinct and hide values", () => {
  assert.throws(() => readBackendConfig({}), hasCode("configuration_missing"));
  for (const url of ["invalid", "http://remote.example", "https://user:secret@demo.supabase.co", "https://demo.supabase.co/path", "https://demo.supabase.co?secret=hidden"]) {
    assert.throws(() => readBackendConfig({ ...config, url }), hasCode("configuration_invalid"));
  }
  assert.equal(readBackendConfig({ ...config, url: "http://127.0.0.1:54321" }).url, "http://127.0.0.1:54321");
});

test("rejects secret keys and legacy JWT keys before a client can be created", () => {
  for (const publishableKey of ["sb_secret_private", "eyJhbGciOiJIUzI1NiJ9.service_role.signature", "not-a-key"]) {
    assert.throws(() => createHeadlessBackend({ ...config, publishableKey }), hasCode("configuration_invalid"));
  }
});

for (const role of ["customer", "store_staff", "maker_staff", "signage"] as const) {
  test(`${role}: verified login, authenticated DB call and logout`, async () => {
    const { client, requests } = fixture(role);
    const identity = await signInBackend(client, "fictional@example.invalid", "test-only-password", role);
    assert.deepEqual(identity.roles, [role]);
    assert.equal(identity.userId, userId);
    if (role === "signage") assert.deepEqual(identity.device, { deviceId, storeId });
    assert.equal((await checkBackendConnection(client, role)).database, "connected");
    const rpc = requests.find((request) => request.url.pathname.includes("/rpc/"))!;
    assert.match(new Headers(rpc.init?.headers).get("Authorization")!, /^Bearer /);
    assert.equal(new Headers(rpc.init?.headers).get("apikey"), config.publishableKey);
    assert.ok(requests.some((request) => request.url.pathname.endsWith("/user")));
    assert.ok(requests.every((request) => request.init?.cache === "no-store" && request.init.signal));
    await signOutBackend(client);
    await assert.rejects(getBackendIdentity(client), hasCode("unauthenticated"));
  });
}

test("no session is unauthenticated and performs no DB call", async () => {
  const { client, requests } = fixture();
  await assert.rejects(checkBackendConnection(client), hasCode("unauthenticated"));
  assert.equal(requests.length, 0);
});

test("user-editable metadata cannot grant a role", async () => {
  const { client } = fixture("customer", { metadata: {}, userMetadata: { kago: { roles: ["store_staff"] } } });
  await assert.rejects(signInBackend(client, "demo@example.invalid", "test", "store_staff"), hasCode("forbidden"));
  await assert.rejects(getBackendIdentity(client), hasCode("unauthenticated"));
});

test("role mismatch clears the session and cannot probe the DB", async () => {
  const { client, requests } = fixture("customer");
  await assert.rejects(signInBackend(client, "demo@example.invalid", "test", "maker_staff"), hasCode("forbidden"));
  await assert.rejects(checkBackendConnection(client), hasCode("unauthenticated"));
  assert.ok(!requests.some((request) => request.url.pathname.includes("/rpc/")));
});

for (const kago of [
  { roles: ["admin"] }, { roles: [] }, { roles: "customer" },
  { roles: ["signage"] },
  { roles: ["signage", "customer"], device_id: deviceId, store_id: storeId },
  { roles: ["signage"], device_id: "slug", store_id: storeId },
]) {
  test(`rejects invalid role/device metadata: ${JSON.stringify(kago)}`, async () => {
    const { client } = fixture("customer", { metadata: { kago } });
    await assert.rejects(signInBackend(client, "demo@example.invalid", "test"), hasCode("forbidden"));
  });
}

test("expired/revoked token is different from absent credentials", async () => {
  const { client } = fixture("customer", { userError: { status: 401, code: "session_expired" } });
  await assert.rejects(signInBackend(client, "demo@example.invalid", "test"), hasCode("session_expired"));
});

test("wrong password returns a safe fixed message", async () => {
  const { client } = fixture("customer", { loginError: true });
  await assert.rejects(signInBackend(client, "demo@example.invalid", "test"), (error: unknown) => {
    assert.ok(hasCode("invalid_credentials")(error));
    assert.ok(!String(error).includes("PRIVATE"));
    return true;
  });
});

for (const [providerCode, expected] of [["PGRST202", "database_not_ready"], ["42501", "forbidden"], ["PGRST301", "session_expired"], ["other", "connection_failed"]]) {
  test(`DB ${providerCode} becomes ${expected}`, async () => {
    const { client } = fixture("customer", { databaseError: providerCode });
    await signInBackend(client, "demo@example.invalid", "test");
    await assert.rejects(checkBackendConnection(client), hasCode(expected));
  });
}

test("DB returning false is not a successful connection", async () => {
  const { client } = fixture("customer", { databaseResult: false });
  await signInBackend(client, "demo@example.invalid", "test");
  await assert.rejects(checkBackendConnection(client), hasCode("forbidden"));
});

test("connection failures and provider messages never leak details", () => {
  for (const cause of [new TypeError("fetch failed SECRET"), { status: 503, message: "SECRET" }, { code: "unknown", message: "SECRET" }]) {
    const error = toBackendError(cause);
    assert.equal(error.code, "connection_failed");
    assert.ok(!JSON.stringify(error).includes("SECRET"));
    assert.equal(backendErrorStatus(error), 503);
  }
  assert.equal(backendErrorStatus(new BackendError("unauthenticated")), 401);
  assert.equal(backendErrorStatus(new BackendError("forbidden")), 403);
});

test("SSR client without cookies returns unauthenticated", async () => {
  const client = createServerBackend(config, { getAll: () => [], setAll: () => {} });
  await assert.rejects(getBackendIdentity(client), hasCode("unauthenticated"));
});

for (const refreshFails of [false, true]) {
  test(`SSR cookie round-trip and expired session refresh (failure=${refreshFails})`, async () => {
    const { fetcher, requests } = fixture("customer", { refreshError: refreshFails });
    const jar = new Map<string, string>();
    const headers: Record<string, string> = {};
    const cookieAdapter = {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll(values: Array<{ name: string; value: string }>, cacheHeaders: Record<string, string>) {
        for (const { name, value } of values) {
          if (value) jar.set(name, value); else jar.delete(name);
        }
        Object.assign(headers, cacheHeaders);
      },
    };
    const first = createServerBackend(config, cookieAdapter, fetcher);
    await signInBackend(first, "demo@example.invalid", "test");
    assert.match(headers["Cache-Control"], /no-store/);
    const next = createServerBackend(config, cookieAdapter, fetcher);
    assert.equal((await getBackendIdentity(next)).userId, userId);
    // Simulate elapsed time without sleeping: expire the stored session.
    const [name, value] = [...jar].find(([name]) => name.endsWith("auth-token"))!;
    const session = JSON.parse(Buffer.from(value.slice("base64-".length), "base64url").toString());
    session.expires_at = Math.floor(Date.now() / 1000) - 120;
    jar.set(name, "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"));
    const refreshed = createServerBackend(config, cookieAdapter, fetcher);
    if (refreshFails) {
      await assert.rejects(getBackendIdentity(refreshed), hasCode("session_expired"));
      assert.equal(jar.size, 0);
    } else {
      assert.equal((await getBackendIdentity(refreshed)).userId, userId);
    }
    assert.ok(requests.some(({ url }) => url.searchParams.get("grant_type") === "refresh_token"));
  });
}
