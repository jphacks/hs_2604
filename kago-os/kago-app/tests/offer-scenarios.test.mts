import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { createDemoDatabase, userId } from "./fixtures/demo-database.mts";
import type { CartSnapshot } from "../src/features/cart/contracts.ts";
import type { OfferList } from "../src/features/offers/contracts.ts";
const demo = await createDemoDatabase(); after(() => demo.db.close()); await demo.seed();
const source = await readFile(new URL("../../kago-core/supabase/seed/app_offer_demo_scenarios.sql", import.meta.url), "utf8");
const S1 = "0da7a001-0000-4000-8000-000000000001", S2 = "0da7a001-0000-4000-8000-000000000002";
const products = new Map((await demo.db.query<{ id: string; code: string }>("select id,code from products")).rows.map(p => [p.code, p.id]));
async function rpc<T>(name: string, args: unknown[], customer = "U2" as "U1" | "U2"): Promise<T> {
  const calls: Record<string, string> = {
    start: "select app_start_visit($1::uuid,$2::boolean,$3::uuid) as value",
    cart: "select app_get_cart($1::uuid) as value", offers: "select app_list_offers($1::uuid) as value",
    set: "select app_set_cart_item($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::integer,$6::text,$7::uuid) as value",
    claim: "select app_claim_offer($1::uuid,$2::uuid,$3::uuid,$4::integer) as value",
    checkout: "select to_jsonb(r) as value from kago_checkout($1::uuid,$2::uuid,$3::integer,$4::integer) r",
  };
  await demo.db.exec("begin");
  try {
    await demo.db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: userId(customer), app_metadata: { kago: { roles: ["customer"] } } })]);
    await demo.db.exec("set local role authenticated");
    const result = (await demo.db.query<{ value: T }>(calls[name], args)).rows[0].value;
    await demo.db.exec("commit"); return result;
  } catch (e) { await demo.db.exec("rollback"); throw e; }
}
const cart = (visit: string) => rpc<CartSnapshot>("cart", [visit]);
const fresh = async () => {
  const active = (await demo.db.query<{ id: string }>("select id from visits where user_id=$1 and store_id=$2 and status='active'", [userId("U2"), S1])).rows[0];
  return rpc<string>("start", [S1, true, active?.id ?? null]);
};
const add = async (visit: string, code: string, quantity: number) => rpc<CartSnapshot>("set", [visit, randomUUID(), products.get(code), quantity, (await cart(visit)).visit.cart_version, "manual", null]);
const offerId = async (name: string) => (await demo.db.query<{ id: string }>("select id from store_offers where headline=$1", [name])).rows[0].id;
const total = (value: CartSnapshot) => value.cart.reduce((n, l) => n + l.price * l.quantity, 0) - (value.discountTotal ?? 0);
const protectedRows = async () => (await demo.db.query<{ value: unknown }>(`select jsonb_build_object(
  'products',(select jsonb_agg(to_jsonb(p) order by p.id) from products p),
  'prices',(select jsonb_agg(to_jsonb(p) order by p.store_id,p.product_id) from store_products p),
  'visits',(select jsonb_agg(to_jsonb(v) order by v.id) from visits v),
  'orders',(select jsonb_agg(to_jsonb(o) order by o.id) from orders o),
  'settings',(select jsonb_agg(to_jsonb(s) order by s.user_id) from customer_settings s)) as value`)).rows[0].value;

test("same-day seed reruns reuse the existing pasta set and add JST-day offers without changing existing data", async () => {
  await demo.db.exec(await readFile(new URL("../../kago-core/supabase/seed/app13_demo_offers.sql", import.meta.url), "utf8"));
  const before = await protectedRows();
  const existing = (await demo.db.query("select * from store_offers order by id")).rows;
  await demo.db.exec(source); await demo.db.exec(source);
  assert.deepEqual(await protectedRows(), before);
  assert.deepEqual((await demo.db.query("select * from store_offers where headline not like 'デモ：%' order by id")).rows, existing);
  const rows = (await demo.db.query<{ valid: boolean }>(`select starts_at<=now() and now()<ends_at
    and starts_at=(date_trunc('day',now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo')
    and ends_at=starts_at+interval '1 day' as valid from store_offers where headline like 'デモ：%'`)).rows;
  assert.equal(rows.length, 3); assert(rows.every(r => r.valid));
  assert.equal((await demo.db.query("select * from store_offers where kind='set_deal' and product_id=$1 and trigger_product_id=$2", [products.get("2900000000162"), products.get("2900000000100")])).rows.length, 1);
});
test("pasta + sauce set charges 493, loses its discount on component removal, and saves the discounted order", async () => {
  const visit = await fresh(), offer = await offerId("パスタ＋トマトソースで10%OFF");
  await assert.rejects(rpc("claim", [visit, randomUUID(), offer, 0]), /trigger/i);
  await add(visit, "2900000000100", 1);
  let value = await rpc<CartSnapshot>("claim", [visit, randomUUID(), offer, (await cart(visit)).visit.cart_version]);
  assert.equal(value.discountTotal, 53); assert.equal(total(value), 493);
  value = await add(visit, "2900000000162", 0); assert.equal(value.discountTotal, 0);
  value = await add(visit, "2900000000162", 1); assert.equal(total(value), 493);
  const order = await rpc<{ total: number }>("checkout", [visit, randomUUID(), value.visit.cart_version, 493]);
  assert.equal(order.total, 493);
});
test("milk + bread charges 421; a milk sale applies to all units and never stacks with the set", async () => {
  const visit = await fresh(); await add(visit, "2900000000049", 1);
  let value = await rpc<CartSnapshot>("claim", [visit, randomUUID(), await offerId("デモ：牛乳＋食パン 10%OFF"), (await cart(visit)).visit.cart_version]);
  assert.equal(value.discountTotal, 45); assert.equal(total(value), 421);
  value = await rpc<CartSnapshot>("claim", [visit, randomUUID(), await offerId("デモ：牛乳タイムセール 20%OFF"), value.visit.cart_version]);
  assert.equal(value.discountTotal, 69); assert.equal(total(value), 397);
  value = await add(visit, "2900000000049", 2);
  assert.equal(value.cart.find(l => l.code === "2900000000049")?.discount, 94);
});
test("deli sale applies 20% to every unit and an identical retry does not add twice", async () => {
  const visit = await fresh(), offer = await offerId("デモ：唐揚げタイムセール 20%OFF"), key = randomUUID();
  const value = await rpc<CartSnapshot>("claim", [visit, key, offer, 0]);
  assert.equal(total(value), 175);
  const replay = await rpc<CartSnapshot & { replayed: boolean }>("claim", [visit, key, offer, 0]);
  assert.equal(replay.replayed, true); assert.deepEqual(replay.cart, value.cart); assert.deepEqual(replay.visit, value.visit);
  const twice = await add(visit, "PLU-2002", 2); assert.equal(total(twice), 350);
});
test("another store/customer cannot claim the scenarios and stopping a sale is preserved by a seed rerun", async () => {
  const foreign = await rpc<string>("start", [S2, true, null]), offer = await offerId("デモ：唐揚げタイムセール 20%OFF");
  assert.equal((await rpc<OfferList>("offers", [foreign])).offers.some(o => o.offerId === offer), false);
  await assert.rejects(rpc("claim", [foreign, randomUUID(), offer, 0]), /unavailable/i);
  const own = await fresh(); await assert.rejects(rpc("cart", [own], "U1"));
  await demo.db.query("update store_offers set status='inactive' where id=$1", [offer]);
  await demo.db.exec(source);
  assert.equal((await demo.db.query<{ status: string }>("select status from store_offers where id=$1", [offer])).rows[0].status, "inactive");
  await assert.rejects(rpc("claim", [own, randomUUID(), offer, 0]), /unavailable/i);
});
test("missing store or stopped prerequisite rolls back the seed without partial inserts", async () => {
  const before = (await demo.db.query("select * from store_offers order by id")).rows;
  await demo.db.query("update stores set slug='renamed' where id=$1", [S1]);
  await assert.rejects(demo.db.exec(source), /S1 is missing/); await demo.db.exec("rollback");
  await demo.db.query("update stores set slug='hiroshima-demo-store' where id=$1", [S1]);
  await demo.db.query("update store_products set is_active=false where store_id=$1 and product_id=$2", [S1, products.get("2900000000056")]);
  await assert.rejects(demo.db.exec(source), /products are missing/); await demo.db.exec("rollback");
  assert.deepEqual((await demo.db.query("select * from store_offers order by id")).rows, before);
});
