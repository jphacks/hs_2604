// #189: the store pick (「店舗からのおすすめ」) is always spaghetti for the demo, on the real seeds (PGlite):
// app_selection_candidates → selectRecommendations → kago_save_selection, next to a higher-priority Insight promotion.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { accounts, createDemoDatabase, userId, type AccountKey } from "./fixtures/demo-database.mts";
import { selectRecommendations } from "../src/features/recommendations/selection.ts";
import type { AssociationRuleSet } from "../src/features/recommendations/association.ts";
import type { SelectionCandidates } from "../src/features/recommendations/selection-contracts.ts";

const rules = JSON.parse(await readFile(new URL("../src/features/recommendations/association-rules.json", import.meta.url), "utf8")) as AssociationRuleSet;
const seed = (name: string) => readFile(new URL(`../../kago-core/supabase/seed/${name}`, import.meta.url), "utf8");
const S1 = "0da7a001-0000-4000-8000-000000000001";
const PROMOTION = "0de0f008-0000-4000-8000-000000000001", VERSION = "0de0f008-0000-4000-8000-000000000002";
const demo = await createDemoDatabase();
after(() => demo.db.close());
await demo.seed();
const { db } = demo;

async function call<T = unknown>(key: AccountKey, sql: string, params: unknown[] = []): Promise<T> {
  await db.exec("begin");
  try {
    const claims = { sub: userId(key), role: "authenticated", app_metadata: { kago: accounts[key].kago } };
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
    await db.exec("set local role authenticated");
    const value = (await db.query<{ value: T }>(sql, params)).rows[0]?.value as T;
    await db.exec("commit");
    return value;
  } catch (error) { await db.exec("rollback"); throw error; }
}
const product = async (c: string) => (await db.query<{ id: string }>("select id from products where code=$1", [c])).rows[0].id;
const PASTA = await product("2900000000100"), YOGURT = await product("2900000000070");
// What a store might have set in Insight: another product with a much higher priority.
await db.exec(`insert into store_promotions(id,store_id,product_id) values ('0da7a0e0-0000-4000-8000-000000000189','${S1}','${YOGURT}');
  insert into promotion_versions(id,promotion_id,version,channels,time_windows,priority,reason_text,starts_at,ends_at)
  values ('0da7a0e1-0000-4000-8000-000000000189','0da7a0e0-0000-4000-8000-000000000189',1,'{app}','[]',1000,'今週の店長おすすめです',now()-interval '1 day',now()+interval '30 days')`);
// The seed's fixed demo period is moved around 'now' so the test does not depend on the calendar.
const pick = (await seed("app_demo_spaghetti_store_pick.sql"))
  .replace("'2026-10-25T00:00:00+09'", "now()-interval '1 hour'").replace("'2026-11-07T00:00:00+09'", "now()+interval '1 day'");

async function visitWith(key: AccountKey, ...codes: string[]) {
  const visit = await call<string>(key, "select app_start_visit($1::uuid,true,(select id from visits where user_id=auth.uid() and store_id=$1::uuid and status='active')) as value", [S1]);
  let version = (await db.query<{ v: number }>("select cart_version as v from visits where id=$1", [visit])).rows[0].v;
  for (const id of await call<{ productId: string }[]>(key, "select coalesce(jsonb_agg(jsonb_build_object('productId',product_id)),'[]') as value from cart_items where visit_id=$1", [visit])) {
    version = (await call<{ visit: { cart_version: number } }>(key, "select app_set_cart_item($1::uuid,gen_random_uuid(),$2::uuid,0,$3::integer,'manual',null) as value", [visit, id.productId, version])).visit.cart_version;
  }
  for (const c of codes) {
    version = (await call<{ visit: { cart_version: number } }>(key, "select app_set_cart_item($1::uuid,gen_random_uuid(),$2::uuid,1,$3::integer,'manual',null) as value", [visit, await product(c), version])).visit.cart_version;
  }
  return visit;
}
const select = async (key: AccountKey, visit: string, pinned?: readonly string[]) => selectRecommendations({
  candidates: await call<SelectionCandidates>(key, "select app_selection_candidates($1::uuid) as value", [visit]),
  settings: { usePurchaseHistory: false, useCurrentCart: true }, summaries: [] }, rules, pinned);
const storePick = (sel: Awaited<ReturnType<typeof select>>) => sel.items.find(i => i.placementType === "store_promo");
const save = (key: AccountKey, sel: Awaited<ReturnType<typeof select>>) => call<string>(key,
  "select kago_save_selection($1::uuid,$2::integer,$3::integer,$4::jsonb,null)::text as value",
  [sel.visitId, sel.cartVersion, sel.ruleVersion, JSON.stringify(sel.items.map(i => ({ slot: i.slot, rank: i.rank, placement_type: i.placementType,
    product_id: i.product.productId, ad_placement_id: i.adPlacementId, promotion_version_id: i.promotionVersionId,
    reason_code: i.reasonCode, reason_text: i.reasonText })))]);

test("seed adds the spaghetti store pick once (App, all day)", async () => {
  await db.exec(pick); await db.exec(pick);
  const rows = (await db.query<{ code: string; channels: string[]; priority: number; status: string }>(`select p.code,pv.channels,pv.priority,pv.status
    from promotion_versions pv join store_promotions sp on sp.id=pv.promotion_id join products p on p.id=sp.product_id where sp.id=$1`, [PROMOTION])).rows;
  assert.deepEqual(rows, [{ code: "2900000000100", channels: ["app"], priority: 100, status: "active" }]);
});
test("the store pick is spaghetti for each customer (history ON and OFF), even with a higher-priority promotion; the DB accepts the save", async () => {
  for (const key of ["U1", "U2"] as AccountKey[]) {
    const visit = await visitWith(key, "2900000000049");
    const sel = await select(key, visit);
    assert.equal(storePick(sel)?.product.productId, PASTA, key);
    assert.equal(storePick(sel)?.promotionVersionId, VERSION);
    assert.equal(storePick(sel)?.reasonText, "デモ：店舗がおすすめするスパゲッティです。");
    assert.match(await save(key, sel), /^[0-9a-f-]{36}$/);
  }
});
test("without the demo pin the priority decides; with spaghetti in the cart the next store pick is shown", async () => {
  const visit = await visitWith("U1", "2900000000049");
  assert.equal(storePick(await select("U1", visit, []))?.product.productId, YOGURT);
  const withPasta = await visitWith("U1", "2900000000100");
  assert.equal(storePick(await select("U1", withPasta))?.product.productId, YOGURT);
});
test("a stopped spaghetti promotion (Insight) is no longer shown and the seed does not re-enable it", async () => {
  await db.query("update promotion_versions set status='inactive' where id=$1", [VERSION]);
  await db.exec(pick);
  const visit = await visitWith("U1", "2900000000049");
  assert.equal(storePick(await select("U1", visit))?.product.productId, YOGURT);
});
