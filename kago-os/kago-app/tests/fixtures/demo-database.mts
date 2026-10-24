import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";

// DATA-01 seed on a disposable PGlite with minimal Supabase Auth/Storage stand-ins.
const core = new URL("../../../kago-core/supabase/", import.meta.url);
export const seedFile = new URL("seed/data01_demo.sql", core);
export const responsesFile = new URL("seed/data01_responses.json", core);

const S1 = "0da7a001-0000-4000-8000-000000000001";
const S2 = "0da7a001-0000-4000-8000-000000000002";
// Real Auth assigns its own UUIDs; these stand in for them only in this test DB.
export const accounts = {
  U1: { n: 1, email: "misaki.sato@example.test", kago: { roles: ["customer"] } },
  U2: { n: 2, email: "ken.tanaka@example.test", kago: { roles: ["customer"] } },
  T1: { n: 11, email: "staff.hiroshima-demo-store@example.test", kago: { roles: ["store_staff"] } },
  T2: { n: 12, email: "staff.hiroshima-station-demo-store@example.test", kago: { roles: ["store_staff"] } },
  W1: { n: 21, email: "staff.setouchi-tomato-foods@example.test", kago: { roles: ["maker_staff"] } },
  W2: { n: 22, email: "staff.check-maker@example.test", kago: { roles: ["maker_staff"] } },
  DV1: { n: 31, email: "signage.hiroshima-demo-entrance@example.test",
    kago: { roles: ["signage"], device_id: "0da7a004-0000-4000-8000-000000000001", store_id: S1 } },
  DV2: { n: 32, email: "signage.hiroshima-demo-pasta-shelf@example.test",
    kago: { roles: ["signage"], device_id: "0da7a004-0000-4000-8000-000000000002", store_id: S1 } },
  DV3: { n: 33, email: "signage.hiroshima-station-entrance@example.test",
    kago: { roles: ["signage"], device_id: "0da7a004-0000-4000-8000-000000000003", store_id: S2 } },
} as const;
export type AccountKey = keyof typeof accounts;
export const userId = (key: AccountKey) => `0da7a0aa-0000-4000-8000-${String(accounts[key].n).padStart(12, "0")}`;

const rows = (from: string, order: string) =>
  `select coalesce(jsonb_agg(to_jsonb(t) order by ${order}), '[]'::jsonb) as value from ${from} t`;
const device = "(select id,store_id,slug,location,is_active,created_at from public.signage_devices)";
const common = {
  ad_calls: rows("public.ad_calls", "t.id"),
  ad_placements: rows("public.ad_placements", "t.id"),
  creative_versions: rows("public.creative_versions", "t.id"),
};
// What each role gets from PostgREST-style reads (select *) under DB-06 RLS.
export const queries: Record<AccountKey, Record<string, string>> = {
  U1: {
    stores: rows("public.stores", "t.slug"),
    products: rows("public.products", "t.code"),
    store_products: rows(`(select * from public.store_products where store_id = '${S1}')`, "t.product_id"),
    customer_settings: rows("public.customer_settings", "t.user_id"),
    orders: rows("public.orders", "t.ordered_at desc"),
    order_items: rows("public.order_items", "t.order_id, t.product_id"),
    ad_placements: common.ad_placements,
    creative_versions: common.creative_versions,
    store_promotions: rows("public.store_promotions", "t.id"),
    promotion_versions: rows("public.promotion_versions", "t.id"),
  },
  U2: {
    customer_settings: rows("public.customer_settings", "t.user_id"),
    orders: rows("public.orders", "t.id"),
    events: rows("public.events", "t.event_id"),
  },
  T1: {
    store_members: rows("public.store_members", "t.store_id"),
    ...common,
    ad_applications: rows("public.ad_applications", "t.id"),
    application_revisions: rows("public.application_revisions", "t.application_id, t.revision"),
    ad_operation_logs: rows("public.ad_operation_logs", "t.id"),
    creatives: rows("public.creatives", "t.id"),
    store_promotions: rows("public.store_promotions", "t.id"),
    promotion_versions: rows("public.promotion_versions", "t.id"),
    signage_devices: rows(device, "t.id"),
    orders: rows("public.orders", "t.id"),
    order_totals: `select coalesce(jsonb_agg(to_jsonb(t) order by t.data_origin), '[]'::jsonb) as value
      from public.kago_order_totals('2026-08-01T00:00:00+09', '2026-11-01T00:00:00+09', '${S1}') t`,
  },
  T2: {
    ...common,
    ad_applications: rows("public.ad_applications", "t.id"),
    signage_devices: rows(device, "t.id"),
  },
  W1: {
    maker_members: rows("public.maker_members", "t.maker_id"),
    ...common,
    creatives: rows("public.creatives", "t.id"),
    ad_applications: rows("public.ad_applications", "t.id"),
    application_revisions: rows("public.application_revisions", "t.application_id, t.revision"),
    ad_operation_logs: rows("public.ad_operation_logs", "t.id"),
  },
  W2: {
    ad_calls: common.ad_calls,
    creatives: rows("public.creatives", "t.id"),
    ad_applications: rows("public.ad_applications", "t.id"),
    ad_placements: common.ad_placements,
  },
  DV1: {
    signage_devices: rows(device, "t.id"),
    ad_placements: common.ad_placements,
    creative_versions: common.creative_versions,
    store_promotions: rows("public.store_promotions", "t.id"),
    promotion_versions: rows("public.promotion_versions", "t.id"),
    orders: rows("public.orders", "t.id"),
  },
  DV2: { signage_devices: rows(device, "t.id") },
  DV3: {
    signage_devices: rows(device, "t.id"),
    ad_placements: common.ad_placements,
    promotion_versions: rows("public.promotion_versions", "t.id"),
  },
};

// Written by DB clocks (triggers, now()), so they differ per run. Compared as present / null only.
export const volatile: Record<string, string[]> = {
  "*": ["updated_at", "reviewed_at", "submitted_at", "approved_at", "received_at"],
  ad_operation_logs: ["created_at"],
};
const placeholder = "2026-10-24T00:00:00+00:00";
export function normalize(name: string, value: unknown) {
  if (!Array.isArray(value)) return value;
  const keys = [...volatile["*"], ...(volatile[name] ?? [])];
  return value.map(row => Object.fromEntries(Object.entries(row as Record<string, unknown>)
    .map(([k, v]) => [k, keys.includes(k) && v !== null ? placeholder : v])));
}

export async function createDemoDatabase(options: { skipAccounts?: AccountKey[] } = {}) {
  const db = new PGlite();
  // Supabase sessions run in UTC, so responses use the same timestamp text as PostgREST.
  await db.exec(`set timezone = 'UTC'; create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, email text unique, raw_app_meta_data jsonb);
    grant usage on schema auth to anon, authenticated, service_role;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    create schema storage;
    create table storage.buckets(id text primary key, name text not null, public boolean,
      file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;`);
  const migrations = new URL("migrations/", core);
  for (const file of (await readdir(migrations)).filter(f => f.endsWith(".sql")).sort()) {
    await db.exec(await readFile(new URL(file, migrations), "utf8"));
  }
  for (const key of Object.keys(accounts) as AccountKey[]) {
    if (options.skipAccounts?.includes(key)) continue;
    await db.query("insert into auth.users(id,email) values ($1,$2)", [userId(key), accounts[key].email]);
  }
  const seed = async () => db.exec(await readFile(seedFile, "utf8"));

  // PGlite has one connection: each read is its own transaction with the account's JWT.
  async function as(key: AccountKey, sql: string) {
    await db.exec("begin");
    try {
      const claims = { sub: userId(key), role: "authenticated", app_metadata: { kago: accounts[key].kago } };
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
      await db.exec("set local role authenticated");
      return (await db.query<{ value: unknown }>(sql)).rows[0].value;
    } finally {
      await db.exec("rollback");
    }
  }
  async function responses() {
    const result: Record<string, Record<string, unknown>> = {};
    for (const [key, named] of Object.entries(queries) as [AccountKey, Record<string, string>][]) {
      result[key] = {};
      for (const [name, sql] of Object.entries(named)) result[key][name] = normalize(name, await as(key, sql));
    }
    return result;
  }
  return { db, seed, as, responses };
}
