// Test-only HTTP fixture, never imported by App. This is not a DB/RLS test.
import { createServer } from "node:http";

export const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export async function createShoppingFixture() {
  const stores = [1, 2].map(n => ({ id: uuid(n), slug: `store-${n}`, name: `架空店舗${n}`, branch_name: "検証店" }));
  const visits = [3, 4].map(n => ({ id: uuid(n + 10), user_id: uuid(n), store_id: uuid(1), status: "active", cart_version: 1, started_at: "2026-10-24T10:00:00+09:00" }));
  const state = { revoked: new Set(), dbError: /** @type {string|null} */ (null), noStores: false, nextVisit: 50, calls: /** @type {Array<{path:string, who:string|undefined, body:Record<string,unknown>}>} */ ([]) };
  const user = n => ({ id: uuid(n), aud: "authenticated", role: "authenticated", email: `user${n}@example.test`, created_at: "2026-10-24T00:00:00Z", app_metadata: { kago: { roles: [n === 5 ? "maker_staff" : "customer"] } }, user_metadata: {} });
  const token = n => [{ alg: "HS256", typ: "JWT" }, { sub: uuid(n), aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 }].map(v => Buffer.from(JSON.stringify(v)).toString("base64url")).join(".") + ".fixture";
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://fixture");
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const send = (data, status = 200) => { res.writeHead(status, { "Content-Type": "application/json", "X-Supabase-Api-Version": "2024-01-01" }); res.end(JSON.stringify(data)); };
    let who;
    try { who = JSON.parse(Buffer.from((req.headers.authorization ?? "").split(".")[1], "base64url").toString()).sub; } catch { /* no session */ }
    state.calls.push({ path: url.pathname, who, body });
    if (url.pathname.endsWith("/token")) {
      const n = body.email === "user3@example.test" ? 3 : body.email === "user4@example.test" ? 4 : body.email === "user5@example.test" ? 5 : null;
      if (!n || body.password !== "fixture-password") return send({ code: "invalid_credentials", msg: "PRIVATE AUTH" }, 400);
      state.revoked.delete(uuid(n));
      return send({ access_token: token(n), refresh_token: `fixture-${n}`, expires_in: 3600, token_type: "bearer", user: user(n) });
    }
    if (url.pathname.endsWith("/logout")) { if (who) state.revoked.add(who); res.writeHead(204); return res.end(); }
    if (!who || state.revoked.has(who)) return send({ code: "bad_jwt", msg: "PRIVATE EXPIRED" }, 401);
    const n = Number(who.slice(-12));
    if (url.pathname.endsWith("/user")) return send(user(n));
    if (state.dbError) return send({ code: state.dbError, message: "PRIVATE SQL" }, state.dbError === "42P01" ? 404 : 503);
    if (url.pathname.endsWith("/rpc/app_start_visit")) {
      if (!stores.some(s => s.id === body.p_store_id)) return send({ code: "42501" }, 403);
      let current = visits.find(v => v.user_id === who && v.store_id === body.p_store_id && v.status === "active");
      if (current && body.p_start_new && current.id === body.p_previous_visit_id) { current.status = "abandoned"; current = null; }
      if (!current) {
        current = { id: uuid(state.nextVisit++), user_id: who, store_id: body.p_store_id, status: "active", cart_version: 0, started_at: "2026-10-24T11:00:00+09:00" };
        visits.push(current);
      }
      return send(current.id);
    }
    const table = url.pathname.split("/").at(-1);
    if (table === "stores") return send(state.noStores ? [] : stores);
    if (table === "visits") return send(visits.filter(v => v.user_id === who && v.status === "active" && (!url.searchParams.has("id") || url.searchParams.get("id") === `eq.${v.id}`)).map(v => ({ id: v.id, store_id: v.store_id, cart_version: v.cart_version, started_at: v.started_at })));
    if (table === "cart_items") {
      const selected = url.searchParams.get("visit_id")?.slice(3);
      const own = visits.find(v => v.user_id === who && v.id === selected && v.status === "active");
      return send(own?.id === uuid(n + 10) ? [{ product_id: uuid(20 + n), quantity: n === 3 ? 2 : 1 }] : []);
    }
    if (table === "products") return send([{ id: uuid(20 + n), code: `000000000000${n}`, name: n === 3 ? "検証用ミルクA" : "検証用りんごB", category: "検証" }]);
    if (table === "store_products") return send([{ product_id: uuid(20 + n), price: n === 3 ? 321 : 157 }]);
    return send({ code: "42P01" }, 404);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { state, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}
