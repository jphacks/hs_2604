import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const fixturePassword = "fixture-password";
export const users = [
  { n: 101, email: "maker-one@example.test", role: "maker_staff" },
  { n: 102, email: "maker-two@example.test", role: "maker_staff" },
  { n: 103, email: "no-membership@example.test", role: "maker_staff" },
  { n: 104, email: "store@example.test", role: "store_staff" },
  { n: 105, email: "customer@example.test", role: "customer" },
  { n: 106, email: "device-one@example.test", role: "signage" },
  { n: 107, email: "device-two@example.test", role: "signage" },
  { n: 108, email: "store-no-membership@example.test", role: "store_staff" },
  { n: 109, email: "store-two@example.test", role: "store_staff" },
  { n: 110, email: "store-multi@example.test", role: "store_staff" },
];
export type FixtureUser = typeof users[number];
export function authUser(user: FixtureUser) {
  return { id: id(user.n), email: user.email, aud: "authenticated", role: "authenticated",
    app_metadata: { kago: { roles: [user.role] } }, user_metadata: {}, created_at: "2026-10-24T00:00:00Z" };
}
const tokens = new Map<number, string>();
export function token(user: FixtureUser) {
  const cached = tokens.get(user.n);
  if (cached) return cached;
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const value = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id(user.n), exp: Math.floor(Date.now() / 1000) + 3600 })}.fixture`;
  tokens.set(user.n, value);
  return value;
}
const columns: Record<string, string[]> = {
  maker_members: ["maker_id", "user_id"],
  store_members: ["store_id", "user_id"],
  stores: ["id", "slug", "name", "branch_name", "timezone"],
  products: ["id", "category"],
  ad_calls: ["id", "store_id", "title", "description", "categories", "channels", "starts_at", "ends_at", "status", "disclosure_scope", "created_at", "updated_at"],
  signage_devices: ["id", "store_id", "slug", "location", "is_active"],
  ad_applications: ["id", "ad_call_id", "maker_id"],
};
export async function createPortalDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, email text);
    grant usage on schema auth to anon,authenticated,service_role;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
  `);
  const migrations = new URL("../../../kago-core/supabase/migrations/", import.meta.url);
  for (const file of (await readdir(migrations)).filter((s) => s.endsWith(".sql")).sort()) {
    await db.exec(await readFile(new URL(file, migrations), "utf8"));
  }
  for (const u of users) await db.query("insert into auth.users(id,email) values ($1,$2)", [id(u.n), u.email]);
  await db.exec(`
    insert into stores(id,slug,name,branch_name) values
      ('${id(1)}','one','架空1号店',null),('${id(2)}','two','架空2号店','駅前');
    insert into makers(id,slug,display_name,is_fictional) values
      ('${id(11)}','maker-one','架空メーカー1',true),('${id(12)}','maker-two','架空メーカー2',true);
    insert into maker_members(maker_id,user_id) values ('${id(11)}','${id(101)}'),('${id(12)}','${id(102)}');
    insert into store_members(store_id,user_id) values ('${id(1)}','${id(104)}'),('${id(2)}','${id(109)}'),('${id(1)}','${id(110)}'),('${id(2)}','${id(110)}');
    insert into products(id,code,name,category) values
      ('${id(21)}','2900000000001','架空のパン','パン'),('${id(22)}','2900000000002','架空のパスタ','食品');
    insert into store_products(store_id,product_id,price) values
      ('${id(1)}','${id(21)}',100),('${id(2)}','${id(21)}',120);
    insert into ad_calls(id,store_id,title,categories,channels,starts_at,ends_at,status,disclosure_scope) values
      ('${id(31)}','${id(1)}','パンの広告募集',array['パン'],array['app','signage'],'2099-01-01','2099-02-01','open',array['impressions']),
      ('${id(32)}','${id(1)}','終了した募集',array['食品'],array['app'],'2099-01-01','2099-02-01','closed','{}'),
      ('${id(33)}','${id(1)}','秘密の下書き',array['食品'],array['app'],'2099-01-01','2099-02-01','draft','{}'),
      ('${id(34)}','${id(2)}','駅前の広告募集',array['パン'],array['signage'],'2099-01-01','2099-02-01','open','{}');
    insert into signage_devices(id,store_id,auth_user_id,slug,location,is_active) values
      ('${id(41)}','${id(1)}','${id(106)}','entrance','入口',true),('${id(42)}','${id(1)}','${id(107)}','disabled','停止端末',false);
    insert into creatives(id,maker_id,product_id) values ('${id(51)}','${id(11)}','${id(21)}'),('${id(52)}','${id(12)}','${id(21)}');
    insert into creative_versions(id,creative_id,version,image_path,headline) values
      ('${id(53)}','${id(51)}',1,'fixture/one.png','広告1'),('${id(54)}','${id(52)}',1,'fixture/two.png','広告2');
    insert into ad_applications(id,ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period) values
      ('${id(61)}','${id(31)}','${id(1)}','${id(11)}','${id(51)}','${id(53)}',array['app'],'[2099-01-01,2099-02-01)'),
      ('${id(62)}','${id(31)}','${id(1)}','${id(12)}','${id(52)}','${id(54)}',array['app'],'[2099-01-01,2099-02-01)');
  `);
  let queue: Promise<unknown> = Promise.resolve();
  function asUser<T>(user: FixtureUser, query: () => Promise<T>, persist = false): Promise<T> {
    const pending = queue.then(async () => {
      await db.exec("begin; set local role authenticated");
      try {
        await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id(user.n), app_metadata: { kago: { roles: [user.role] } } })]);
        const value = await query();
        await db.exec(persist ? "commit" : "rollback");
        return value;
      } catch (error) { await db.exec("rollback"); throw error; }
    });
    queue = pending.catch(() => undefined);
    return pending;
  }
  const expired = new Set<string>();
  const requests: string[] = [];
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", "x-supabase-api-version": "2024-01-01" } });
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    requests.push(method + " " + url.pathname);
    const headers = new Headers(init?.headers);
    const bearer = headers.get("authorization")?.replace(/^Bearer /i, "");
    const user = users.find((u) => token(u) === bearer || bearer?.split(".")[1] === token(u).split(".")[1]);
    if (url.pathname.endsWith("/token")) {
      const body = JSON.parse(String(init?.body));
      const found = users.find((u) => u.email === body.email);
      if (!found || body.password !== fixturePassword) return json({ code: "invalid_credentials" }, 400);
      return json({ access_token: token(found), refresh_token: "fixture-refresh", expires_in: 3600, token_type: "bearer", user: authUser(found) });
    }
    if (url.pathname.endsWith("/logout")) return json({});
    if (!user || expired.has(id(user.n))) return json({ code: "session_not_found" }, 401);
    if (url.pathname.endsWith("/user")) return json(authUser(user));
    if (!["GET", "POST", "PATCH"].includes(method) || !url.pathname.startsWith("/rest/v1/")) return json({ code: "42501" }, 403);
    const table = url.pathname.split("/").pop()!;
    if (!columns[table]) return json({ code: "42P01" }, 404);
    const allowed = (name: string) => { if (!columns[table].includes(name)) throw new Error("Unexpected query column"); return name; };
    const select = (url.searchParams.get("select") ?? "").split(",").map(allowed).join(",");
    const params: unknown[] = [];
    const where: string[] = [];
    for (const [key, value] of url.searchParams) {
      if (["select", "order", "limit", "offset"].includes(key)) continue;
      const col = allowed(key);
      if (value.startsWith("in.(")) {
        const values = value.slice(4, -1).split(",");
        where.push(col + " in (" + values.map((v) => { params.push(v); return "$" + params.length; }).join(",") + ")");
      } else {
        const dot = value.indexOf(".");
        const op = value.slice(0, dot);
        if (!["eq", "neq"].includes(op)) throw new Error("Unexpected query operator");
        params.push(value.slice(dot + 1));
        where.push(col + (op === "eq" ? "=" : "<>") + "$" + params.length);
      }
    }
    const order = (url.searchParams.get("order") ?? "").split(",").filter(Boolean).map((v) => {
      const [col, dir] = v.split(".");
      return allowed(col) + (dir === "desc" ? " desc" : " asc");
    }).join(",");
    try {
      let sql = "select " + select + " from " + table + (where.length ? " where " + where.join(" and ") : "") + (order ? " order by " + order : "");
      if (method !== "GET") {
        if (table !== "ad_calls") return json({ code: "42501" }, 403);
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const keys = Object.keys(body).map(allowed);
        const placeholders = keys.map((key) => { params.push(body[key]); return "$" + params.length; });
        sql = method === "POST"
          ? "insert into ad_calls (" + keys.join(",") + ") values (" + placeholders.join(",") + ") returning " + select
          : "update ad_calls set " + keys.map((key, i) => key + "=" + placeholders[i]).join(",")
            + (where.length ? " where " + where.join(" and ") : "") + " returning " + select;
      }
      const rows = await asUser(user, async () => (await db.query(sql, params)).rows, method !== "GET");
      return json(headers.get("accept")?.includes("vnd.pgrst.object") ? rows[0] ?? null : rows, method === "POST" ? 201 : 200);
    } catch (error) { return json({ code: (error as { code: string }).code, message: "fixture database rejected query" }, 400); }
  };
  return { db, asUser, fetcher, expired, requests, close: () => db.close() };
}
