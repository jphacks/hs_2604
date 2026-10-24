import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";

export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export async function createCartDatabase() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, email text);
    grant usage on schema auth to anon, authenticated, service_role;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;`);
  // The hosted Storage service supplies these tables. This fixture only needs their
  // shape to apply COM-03's policies; it does not emulate the Storage API or test it.
  await db.exec(`create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;`);
  const migrations = new URL("../../../kago-core/supabase/migrations/", import.meta.url);
  for (const file of (await readdir(migrations)).filter(f => f.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(file, migrations), "utf8"));
  await db.query("insert into auth.users(id,email) values ($1,'user3@example.test'),($2,'user4@example.test'),($3,'user5@example.test')", [id(3), id(4), id(5)]);
  await db.query("insert into stores(id,slug,name) values ($1,'one','検証1号店'),($2,'two','検証2号店')", [id(1), id(2)]);
  await db.query("insert into products(id,code,name,category) values ($1,'4900000000016','検証ミルク','乳製品'),($2,'PLU-APPLE','検証りんご','青果'),($3,'4900000000023','停止中の商品','食品')", [id(20),id(21),id(22)]);
  await db.query("insert into store_products(store_id,product_id,price,is_active) values ($1,$3,248,true),($2,$3,298,true),($1,$4,158,true),($1,$5,99,false)", [id(1),id(2),id(20),id(21),id(22)]);
  await db.query("insert into visits(id,user_id,store_id) values ($1,$4,$6),($2,$4,$7),($3,$5,$6)", [id(13),id(14),id(15),id(3),id(4),id(1),id(2)]);
  // PGlite has one SQL connection: serialize sessions, never let roles leak between calls.
  let queue = Promise.resolve();
  async function as<T>(user: number, operation: () => Promise<T>, role = "customer") {
    const previous = queue; let finish!: () => void;
    queue = new Promise<void>(resolve => { finish = resolve; }); await previous;
    try {
      await db.exec("begin");
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub:id(user),app_metadata:{kago:{roles:[role]}} })]);
      await db.exec("set local role authenticated");
      try { const result = await operation(); await db.exec("commit"); return result; }
      catch (error) { await db.exec("rollback"); throw error; }
    } finally { finish(); }
  }
  async function rpc(name: string, args: unknown[], user = 3, role = "customer") {
    const functions: Record<string, string> = {
      app_get_cart: "select app_get_cart($1::uuid) as value",
      app_list_products: "select app_list_products($1::uuid,$2::text,$3::integer) as value",
      app_lookup_product: "select app_lookup_product($1::uuid,$2::uuid,$3::text,$4::uuid,$5::text) as value",
      app_set_cart_item: "select app_set_cart_item($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::integer,$6::text,$7::uuid) as value",
      app_start_visit: "select app_start_visit($1::uuid,$2::boolean,$3::uuid) as value",
      kago_checkout: "select to_jsonb(r) as value from kago_checkout($1::uuid,$2::uuid,$3::integer,$4::integer) r",
      app_list_offers: "select app_list_offers($1::uuid) as value",
      app_claim_offer: "select app_claim_offer($1::uuid,$2::uuid,$3::uuid,$4::integer) as value",
      app_record_offer_event: "select app_record_offer_event($1::uuid,$2::uuid,$3::uuid,$4::text)::text as value",
    };
    if (!functions[name]) throw new Error("Unexpected RPC");
    const values = name === "app_lookup_product" && args.length === 4 ? [...args, null] : args;
    return as(user, async () => (await db.query<{value: unknown}>(functions[name], values)).rows[0].value, role);
  }
  return { db, as, rpc };
}
