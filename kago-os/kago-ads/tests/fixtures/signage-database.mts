// Signage 端末の DB 接続を確かめるための使い捨ての DB（SIG-01〜03）。正式の migration・RLS をそのまま適用し、
// Supabase の Auth・PostgREST・Storage の署名付き URL のうち、端末が使う最小限だけを真似する
// 実在の接続先・認証情報は使わない。データはすべて架空
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";

export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const fixturePassword = "fixture-password";
export const imagePath = (maker: number, creative: number, asset: number) => `${id(maker)}/${id(creative)}/${id(asset)}.png`;

type Kago = { roles: string[]; device_id?: string; store_id?: string };
export const users = [
  { n: 101, email: "maker@example.test", kago: { roles: ["maker_staff"] } },
  { n: 104, email: "store@example.test", kago: { roles: ["store_staff"] } },
  { n: 105, email: "customer@example.test", kago: { roles: ["customer"] } },
  { n: 106, email: "device-one@example.test", kago: { roles: ["signage"], device_id: id(41), store_id: id(1) } },
  { n: 107, email: "device-off@example.test", kago: { roles: ["signage"], device_id: id(42), store_id: id(1) } },
  { n: 108, email: "device-two@example.test", kago: { roles: ["signage"], device_id: id(43), store_id: id(2) } },
] satisfies { n: number; email: string; kago: Kago }[];
export type FixtureUser = (typeof users)[number];
export const user = (email: string) => users.find((u) => u.email === email)!;

function authUser(u: FixtureUser) {
  return {
    id: id(u.n), email: u.email, aud: "authenticated", role: "authenticated",
    app_metadata: { kago: u.kago }, user_metadata: {}, created_at: "2026-10-24T00:00:00Z",
  };
}
const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
const token = (u: FixtureUser) => `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id(u.n), exp: 4102444800 })}.fixture`;

const TABLES = new Set([
  "signage_devices", "stores", "ad_placements", "store_promotions", "promotion_versions", "store_products",
  "creative_versions", "creatives", "makers", "products",
]);
const name = (v: string) => {
  if (!/^[a-z_]+$/.test(v)) throw new Error("Unexpected identifier");
  return v;
};

// 期間は 2026-01-01〜2099-01-01（[開始, 終了)）。デモの日付に関係なく配信期間の中になる
const SEED = `
  insert into stores(id,slug,name,branch_name) values
    ('${id(1)}','fixture-one','架空1号店',null),('${id(2)}','fixture-two','架空1号店','駅前');
  insert into store_members(store_id,user_id) values ('${id(1)}','${id(104)}'),('${id(2)}','${id(104)}');
  insert into makers(id,slug,display_name,is_fictional) values ('${id(11)}','fixture-maker','架空トマト食品',true);
  insert into maker_members(maker_id,user_id) values ('${id(11)}','${id(101)}');
  insert into products(id,code,name,category) values
    ('${id(21)}','2900000000901','架空の塩パン','パン'),('${id(22)}','2900000000902','架空のパスタソース','調味料'),
    ('${id(23)}','2900000000903','架空の牛乳','乳製品');
  insert into store_products(store_id,product_id,price) values
    ('${id(1)}','${id(21)}',130),('${id(1)}','${id(22)}',298),('${id(1)}','${id(23)}',238),('${id(2)}','${id(22)}',278);
  insert into ad_calls(id,store_id,title,categories,channels,starts_at,ends_at,status,disclosure_scope) values
    ('${id(31)}','${id(1)}','架空の募集',array['調味料','パン','乳製品'],array['app','signage'],'2026-01-01+09','2099-01-01+09','open','{}'),
    ('${id(32)}','${id(2)}','駅前の募集',array['調味料'],array['signage'],'2026-01-01+09','2099-01-01+09','open','{}');
  insert into creatives(id,maker_id,product_id) values
    ('${id(51)}','${id(11)}','${id(22)}'),('${id(52)}','${id(11)}','${id(23)}'),
    ('${id(56)}','${id(11)}','${id(21)}'),('${id(57)}','${id(11)}','${id(22)}');
  insert into creative_versions(id,creative_id,version,image_path,headline) values
    ('${id(53)}','${id(51)}',1,'${imagePath(11, 51, 91)}','ソースの広告'),
    ('${id(54)}','${id(52)}',1,'${imagePath(11, 52, 92)}','App だけの広告'),
    ('${id(58)}','${id(56)}',1,'${imagePath(11, 56, 93)}','停止した広告'),
    ('${id(59)}','${id(57)}',1,'${imagePath(11, 57, 94)}','駅前の広告');
  insert into ad_applications(id,ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period) values
    ('${id(61)}','${id(31)}','${id(1)}','${id(11)}','${id(51)}','${id(53)}',array['app','signage'],'[2026-01-01+09,2099-01-01+09)'),
    ('${id(62)}','${id(31)}','${id(1)}','${id(11)}','${id(52)}','${id(54)}',array['app'],'[2026-01-01+09,2099-01-01+09)'),
    ('${id(64)}','${id(31)}','${id(1)}','${id(11)}','${id(56)}','${id(58)}',array['signage'],'[2026-01-01+09,2099-01-01+09)'),
    ('${id(63)}','${id(32)}','${id(2)}','${id(11)}','${id(57)}','${id(59)}',array['signage'],'[2026-01-01+09,2099-01-01+09)');
  update ad_applications set status='approved',reviewed_by='${id(104)}';
  insert into ad_placements(id,application_id,revision,store_id,creative_version_id,channels,starts_at,ends_at,approved_by) values
    ('${id(71)}','${id(61)}',1,'${id(1)}','${id(53)}',array['app','signage'],'2026-01-01+09','2099-01-01+09','${id(104)}'),
    ('${id(72)}','${id(62)}',1,'${id(1)}','${id(54)}',array['app'],'2026-01-01+09','2099-01-01+09','${id(104)}'),
    ('${id(74)}','${id(64)}',1,'${id(1)}','${id(58)}',array['signage'],'2026-01-01+09','2099-01-01+09','${id(104)}'),
    ('${id(73)}','${id(63)}',1,'${id(2)}','${id(59)}',array['signage'],'2026-01-01+09','2099-01-01+09','${id(104)}');
  update ad_placements set status='suspended',suspend_reason='確認のため停止',suspended_by='${id(104)}',suspended_at=now()
    where id='${id(74)}';
  insert into store_promotions(id,store_id,product_id) values ('${id(81)}','${id(1)}','${id(21)}'),('${id(82)}','${id(1)}','${id(23)}');
  insert into promotion_versions(id,promotion_id,version,channels,time_windows,priority,reason_text,starts_at,ends_at) values
    ('${id(83)}','${id(81)}',1,array['signage'],'[]',50,'古い版の理由','2026-01-01+09','2099-01-01+09');
  update promotion_versions set status='inactive' where id='${id(83)}';
  insert into promotion_versions(id,promotion_id,version,channels,time_windows,priority,reason_text,starts_at,ends_at) values
    ('${id(84)}','${id(81)}',2,array['app','signage'],'[]',50,'朝と夕方に焼き上げています','2026-01-01+09','2099-01-01+09'),
    ('${id(85)}','${id(82)}',1,array['signage'],'[{"weekdays":[1,2,3,4,5,6,7],"start":"16:00","end":"19:00"}]',60,'夕方の特売です','2026-01-01+09','2099-01-01+09');
  insert into signage_devices(id,store_id,auth_user_id,slug,location,is_active) values
    ('${id(41)}','${id(1)}','${id(106)}','entrance','入口',true),
    ('${id(42)}','${id(1)}','${id(107)}','retired','撤去した端末',false),
    ('${id(43)}','${id(2)}','${id(108)}','station','駅前の入口',true);
`;

export async function createSignageDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    -- Supabase Storage の土台。バケットと権限は正式の migration が作る
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,metadata jsonb default '{}',unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to authenticated,service_role;
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
  await db.exec(SEED);

  let queue: Promise<unknown> = Promise.resolve();
  /** その利用者の JWT（app_metadata.kago）と authenticated の役割で SQL を実行する */
  function asUser<T>(u: FixtureUser, query: () => Promise<T>): Promise<T> {
    const pending = queue.then(async () => {
      await db.exec("begin; set local role authenticated");
      try {
        await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id(u.n), app_metadata: { kago: u.kago } })]);
        const result = await query();
        await db.exec("commit");
        return result;
      } catch (error) {
        await db.exec("rollback");
        throw error;
      }
    });
    queue = pending.catch(() => undefined);
    return pending;
  }

  const requests: string[] = [];
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", "x-supabase-api-version": "2024-01-01" } });
  const fail = (error: unknown) => json({ code: (error as { code?: string }).code ?? "XX000", message: "fixture database rejected query" }, 400);

  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    requests.push(`${method} ${url.pathname}`);
    const bearer = new Headers(init?.headers).get("authorization")?.replace(/^Bearer /i, "");
    const caller = users.find((u) => token(u) === bearer);

    if (url.pathname.endsWith("/auth/v1/token")) {
      const body = JSON.parse(String(init?.body));
      const found = users.find((u) => u.email === body.email);
      if (!found || body.password !== fixturePassword) return json({ code: "invalid_credentials" }, 400);
      return json({ access_token: token(found), refresh_token: "fixture-refresh", expires_in: 3600, token_type: "bearer", user: authUser(found) });
    }
    if (url.pathname.endsWith("/auth/v1/logout")) return json({});
    if (!caller) return json({ code: "PGRST301", message: "JWT required" }, 401);
    if (url.pathname.endsWith("/auth/v1/user")) return json(authUser(caller));

    // Storage：署名付き URL を作る（読めるかは正式の Storage の RLS 関数で判定する）
    const sign = url.pathname.match(/\/storage\/v1\/object\/sign\/ad-images\/(.+)$/);
    if (sign && method === "POST") {
      const path = decodeURIComponent(sign[1]);
      const allowed = await asUser(caller, async () =>
        (await db.query<{ ok: boolean }>("select public.kago_can_read_ad_image($1) as ok", [path])).rows[0]?.ok);
      if (!allowed) return json({ statusCode: "404", error: "not_found", message: "Object not found" }, 400);
      return json({ signedURL: `/object/sign/ad-images/${path}?token=fixture` });
    }

    const table = url.pathname.match(/\/rest\/v1\/([a-z_]+)$/)?.[1];
    if (!table) return json({ code: "42501" }, 403);

    if (method === "POST" && table === "signage_plays") {
      const rows = JSON.parse(String(init?.body)) as Record<string, unknown>[];
      try {
        await asUser(caller, async () => {
          for (const row of rows) {
            const cols = Object.keys(row).map(name);
            await db.query(
              `insert into signage_plays(${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`,
              cols.map((c) => row[c]),
            );
          }
        });
        return new Response(null, { status: 201 });
      } catch (error) {
        return fail(error);
      }
    }
    if (method !== "GET" || !TABLES.has(table)) return json({ code: "42501" }, 403);

    const select = (url.searchParams.get("select") ?? "*").split(",").map(name).join(",");
    const params: unknown[] = [];
    const where: string[] = [];
    for (const [key, value] of url.searchParams) {
      if (["select", "order", "limit", "offset"].includes(key)) continue;
      const col = name(key);
      if (value.startsWith("in.(")) {
        const values = value.slice(4, -1).split(",").map((v) => v.replace(/^"|"$/g, ""));
        where.push(`${col}::text in (${values.map((v) => (params.push(v), `$${params.length}`)).join(",")})`);
      } else {
        const dot = value.indexOf(".");
        const op = value.slice(0, dot);
        if (!["eq", "neq"].includes(op)) throw new Error("Unexpected operator");
        params.push(value.slice(dot + 1));
        where.push(`${col}::text ${op === "eq" ? "=" : "<>"} $${params.length}`);
      }
    }
    const order = (url.searchParams.get("order") ?? "").split(",").filter(Boolean)
      .map((v) => { const [c, dir] = v.split("."); return `${name(c)} ${dir === "desc" ? "desc" : "asc"}`; }).join(",");
    try {
      const rows = await asUser(caller, async () => (await db.query(
        `select ${select} from ${table}${where.length ? ` where ${where.join(" and ")}` : ""}${order ? ` order by ${order}` : ""}`,
        params,
      )).rows);
      return json(rows);
    } catch (error) {
      return fail(error);
    }
  };

  return { db, asUser, fetcher, requests, close: () => db.close() };
}
