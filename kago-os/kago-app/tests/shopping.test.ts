import assert from "node:assert/strict";
import test from "node:test";
import { BackendError, createHeadlessBackend, signInBackend } from "@kago/backend";
import { loadShoppingContext, shoppingError, startShoppingVisit } from "../src/features/shopping/service.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const store = { id: id(1), slug: "test-store", name: "架空店舗", branch_name: "検証店" };
const visit = (user: number) => ({ id: id(10 + user), store_id: store.id, cart_version: 3, started_at: "2026-10-24T10:00:00+09:00" });
const hasCode = (code: string) => (e: unknown) => e instanceof BackendError && e.code === code;

async function fixture(user = 2, options: { role?: string; expired?: boolean; dbError?: string; missingPrice?: boolean; missingProduct?: boolean; quantity?: number; rpcResult?: unknown; noStores?: boolean; noItems?: boolean } = {}) {
  const requests: Array<{ url: URL; body: unknown }> = [];
  const authUser = { id: id(user), aud: "authenticated", created_at: "2026-10-24T00:00:00Z", app_metadata: { kago: { roles: [options.role ?? "customer"] } }, user_metadata: {} };
  const token = [{ alg: "HS256", typ: "JWT" }, { sub: id(user), aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 }].map(v => Buffer.from(JSON.stringify(v)).toString("base64url")).join(".") + ".sig";
  const client = createHeadlessBackend({ url: "https://test.supabase.co", publishableKey: "sb_publishable_test" }, async (input, init) => {
    const url = new URL(String(input));
    requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.pathname.endsWith("/token")) return Response.json({ access_token: token, refresh_token: "test-refresh", expires_in: 3600, token_type: "bearer", user: authUser });
    if (url.pathname.endsWith("/user")) {
      if (options.expired) return Response.json({ code: "bad_jwt", msg: "PRIVATE" }, { status: 401, headers: { "X-Supabase-Api-Version": "2024-01-01" } });
      return Response.json(authUser);
    }
    if (options.dbError) return Response.json({ code: options.dbError, message: "PRIVATE SQL" }, { status: 400 });
    if (url.pathname.endsWith("/rpc/app_start_visit")) return Response.json(options.rpcResult ?? visit(user).id);
    const table = url.pathname.split("/").at(-1);
    if (table === "stores") return Response.json(options.noStores ? [] : [store]);
    if (table === "visits") {
      assert.equal(url.searchParams.get("user_id"), `eq.${id(user)}`);
      assert.equal(url.searchParams.get("status"), "eq.active");
      return Response.json([visit(user)]);
    }
    if (table === "cart_items") {
      assert.equal(url.searchParams.get("visit_id"), `eq.${visit(user).id}`);
      return Response.json(options.noItems ? [] : [{ product_id: id(20), quantity: options.quantity ?? user }]);
    }
    if (table === "products") return Response.json(options.missingProduct ? [] : [{ id: id(20), code: "0000000000001", name: `利用者${user}の対象商品`, category: "検証" }]);
    if (table === "store_products") {
      assert.equal(url.searchParams.get("store_id"), `eq.${store.id}`);
      return Response.json(options.missingPrice ? [] : [{ product_id: id(20), price: 321 }]);
    }
    throw new Error("Unexpected fixture endpoint");
  });
  await client.auth.signInWithPassword({ email: "fictional@example.test", password: "fixture-only" });
  return { client, requests };
}

test("reload restores the same own active visit and DB cart, never demo prices", async () => {
  const { client } = await fixture();
  const first = await loadShoppingContext(client, visit(2).id);
  assert.equal(first.userId, id(2));
  assert.equal(first.visit?.id, visit(2).id);
  assert.deepEqual(first.cart, [{ productId: id(20), code: "0000000000001", name: "利用者2の対象商品", category: "検証", price: 321, quantity: 2 }]);
  assert.deepEqual(await loadShoppingContext(client, visit(2).id), first);
});

test("two authenticated users cannot restore each other's selected visit", async () => {
  for (const user of [2, 3]) {
    const { client, requests } = await fixture(user);
    const otherVisit = visit(user === 2 ? 3 : 2).id;
    const data = await loadShoppingContext(client, otherVisit);
    assert.equal(data.visit, null);
    assert.deepEqual(data.cart, []);
    assert.ok(!requests.some(r => r.url.pathname.endsWith("/cart_items")));
    const own = await loadShoppingContext(client, visit(user).id);
    assert.equal(own.cart[0].quantity, user);
  }
});

test("missing/malformed/completed/unknown visit is a store-choice state, not a new visit", async () => {
  const { client, requests } = await fixture();
  for (const cookie of [undefined, "bad-cookie", id(999)]) {
    const context = await loadShoppingContext(client, cookie);
    assert.equal(context.visit, null);
    assert.deepEqual(context.cart, []);
  }
  assert.ok(!requests.some(r => r.url.pathname.includes("/rpc/")));
});

test("empty stores and an empty own cart are valid empty states", async () => {
  const absent = await fixture(2, { noStores: true });
  assert.equal((await loadShoppingContext(absent.client, visit(2).id)).visit, null);
  const empty = await fixture(2, { noItems: true });
  const context = await loadShoppingContext(empty.client, visit(2).id);
  assert.ok(context.visit);
  assert.deepEqual(context.cart, []);
});

test("store start/resume uses the atomic DB RPC without a client-supplied user id", async () => {
  const { client, requests } = await fixture();
  for (const startNew of [false, true]) {
    const context = await startShoppingVisit(client, { storeId: store.id, startNew, previousVisitId: visit(2).id });
    assert.equal(context.visit?.id, visit(2).id);
    assert.deepEqual(requests.filter(r => r.url.pathname.endsWith("/rpc/app_start_visit")).at(-1)?.body, { p_store_id: store.id, p_start_new: startNew, p_previous_visit_id: visit(2).id });
  }
});

test("invalid store or previous visit never reaches the start RPC", async () => {
  const { client, requests } = await fixture();
  for (const input of [{ storeId: "bad", startNew: false, previousVisitId: null }, { storeId: store.id, startNew: true, previousVisitId: "bad" }]) await assert.rejects(startShoppingVisit(client, input), hasCode("forbidden"));
  assert.ok(!requests.some(r => r.url.pathname.includes("/rpc/")));
});

test("a start RPC returning another user's visit is rejected", async () => {
  const { client } = await fixture(2, { rpcResult: visit(3).id });
  await assert.rejects(startShoppingVisit(client, { storeId: store.id, startNew: false, previousVisitId: null }), hasCode("forbidden"));
});

test("unauthenticated, expired and wrong-role sessions stop before any business query", async () => {
  const anonymous = createHeadlessBackend({ url: "https://test.supabase.co", publishableKey: "sb_publishable_test" }, async () => { throw new Error("No requests expected"); });
  await assert.rejects(loadShoppingContext(anonymous, visit(2).id), hasCode("unauthenticated"));
  for (const options of [{ expired: true }, { role: "store_staff" }, { role: "maker_staff" }]) {
    const { client, requests } = await fixture(2, options);
    await assert.rejects(loadShoppingContext(client, visit(2).id), hasCode(options.expired ? "session_expired" : "forbidden"));
    assert.ok(!requests.some(r => r.url.pathname.includes("/rest/")));
  }
});

test("missing DB/columns/relations/RPC is explicit and does not expose SQL", async () => {
  for (const code of ["42P01", "42703", "PGRST200", "PGRST202", "PGRST204", "PGRST205"]) {
    const { client } = await fixture(2, { dbError: code });
    await assert.rejects(loadShoppingContext(client, visit(2).id), e => hasCode("database_not_ready")(e) && !String(e).includes("PRIVATE"));
  }
  assert.equal(shoppingError({ code: "42501", message: "PRIVATE" }).code, "forbidden");
  assert.equal(shoppingError({ code: "42501", message: "permission denied for table visits" }).code, "database_not_ready");
  assert.equal(shoppingError({ code: "42501", message: "permission denied for function app_start_visit" }).code, "database_not_ready");
  assert.equal(shoppingError(new Error("PRIVATE network details")).code, "connection_failed");
});

test("incomplete cart or invalid quantity cannot become a successful partial cart", async () => {
  for (const options of [{ missingPrice: true }, { missingProduct: true }, { quantity: 0 }, { quantity: 1.5 }]) {
    const { client } = await fixture(2, options);
    await assert.rejects(loadShoppingContext(client, visit(2).id), hasCode("database_not_ready"));
  }
});

test("a role-mismatched login does not leave an authenticated session", async () => {
  const { client } = await fixture(2, { role: "maker_staff" });
  await assert.rejects(signInBackend(client, "fictional@example.test", "fixture-only", "customer"), hasCode("forbidden"));
  // A failed consumer-role check must clear the local authenticated session.
  assert.equal((await client.auth.getSession()).data.session, null);
});
