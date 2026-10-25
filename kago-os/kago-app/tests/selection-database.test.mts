// APP-05 on the DATA-01 demo data (official migrations + seed on PGlite): candidates, selection, save.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { accounts, createDemoDatabase, userId, type AccountKey } from "./fixtures/demo-database.mts";
import { selectRecommendations } from "../src/features/recommendations/selection.ts";
import { buildPurchaseSummaries } from "../src/features/recommendations/customer.ts";
import type { AssociationRuleSet } from "../src/features/recommendations/association.ts";
import type { SelectionCandidates } from "../src/features/recommendations/selection-contracts.ts";
import type { PurchaseOrder } from "../src/features/account/contracts.ts";

const rules = JSON.parse(await readFile(new URL("../src/features/recommendations/association-rules.json", import.meta.url), "utf8")) as AssociationRuleSet;
const S1 = "0da7a001-0000-4000-8000-000000000001";
const PL1 = "0da7a009-0000-4000-8000-000000000001";
const demo = await createDemoDatabase();
after(() => demo.db.close());
await demo.seed();
const { db } = demo;

// Committed call as an account (the fixture's `as` always rolls back).
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
const code = (expected: string) => (e: unknown) => (e as { code?: string }).code === expected;
const product = async (c: string) => (await db.query<{ id: string }>("select id from products where code=$1", [c])).rows[0].id;
const PASTA = await product("2900000000100"), SAUCE = await product("2900000000162"), MILK = await product("2900000000049");
// An all-day App promotion so the result does not depend on the hour (SP1 is 16–19 JST, SP2 is Signage only).
const YOGURT = await product("2900000000070");
await db.exec(`insert into store_promotions(id,store_id,product_id) values ('0da7a0e0-0000-4000-8000-000000000001','${S1}','${YOGURT}');
  insert into promotion_versions(id,promotion_id,version,channels,time_windows,priority,reason_text,starts_at,ends_at)
  values ('0da7a0e1-0000-4000-8000-000000000001','0da7a0e0-0000-4000-8000-000000000001',1,'{app}','[]',9,'今週の店長おすすめです',now()-interval '1 day',now()+interval '30 days')`);

async function visitWith(key: AccountKey, ...codes: string[]) {
  const visit = await call<string>(key, "select app_start_visit($1::uuid,true,(select id from visits where user_id=auth.uid() and store_id=$1::uuid and status='active')) as value", [S1]);
  let version = 0;
  for (const c of codes) {
    const r = await call<{ visit: { cart_version: number } }>(key, "select app_set_cart_item($1::uuid,gen_random_uuid(),$2::uuid,1,$3::integer,'manual',null) as value", [visit, await product(c), version]);
    version = r.visit.cart_version;
  }
  return visit;
}
const candidatesOf = (key: AccountKey, visit: string) => call<SelectionCandidates>(key, "select app_selection_candidates($1::uuid) as value", [visit]);
// asOf: history reference time. Defaults to the visit start (now); fixed where a test depends on the cycle.
async function inputs(key: AccountKey, visit: string, asOf?: string) {
  const candidates = await candidatesOf(key, visit);
  const settings = await call<{ use_purchase_history: boolean; use_current_cart: boolean } | null>(key, "select to_jsonb(s) as value from customer_settings s");
  const orders = await call<PurchaseOrder[]>(key, `select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'orderedAt',o.ordered_at,'total',o.total,'dataOrigin',o.data_origin,
    'items',(select jsonb_agg(jsonb_build_object('productId',i.product_id,'name',i.product_name,'unitPrice',i.unit_price,'quantity',i.quantity)) from order_items i where i.order_id=o.id))),'[]') as value
    from orders o where o.store_id=$1`, [S1]);
  const history = !!settings?.use_purchase_history;
  return { candidates, settings: { usePurchaseHistory: history, useCurrentCart: !!settings?.use_current_cart },
    summaries: history ? buildPurchaseSummaries(orders, asOf ?? candidates.visit.started_at) : [] };
}
const save = (key: AccountKey, sel: ReturnType<typeof selectRecommendations>, id: string | null = null) => call<string>(key,
  "select kago_save_selection($1::uuid,$2::integer,$3::integer,$4::jsonb,$5::uuid)::text as value",
  [sel.visitId, sel.cartVersion, sel.ruleVersion, JSON.stringify(sel.items.map(i => ({ slot: i.slot, rank: i.rank, placement_type: i.placementType,
    product_id: i.product.productId, ad_placement_id: i.adPlacementId, promotion_version_id: i.promotionVersionId,
    reason_code: i.reasonCode, reason_text: i.reasonText }))), id]);

test("candidates: approved App ad with sponsor name, App promotions in their window only, active listings, store popularity", async () => {
  const visit = await visitWith("U1", "2900000000100");
  const c = await candidatesOf("U1", visit);
  assert.deepEqual(c.cart.map(x => x.productId), [PASTA]);
  const pl1 = c.ads.find(a => a.adPlacementId === PL1)!;
  assert.equal(pl1.productId, SAUCE); assert.equal(pl1.makerName, "瀬戸内トマト食品"); assert.equal(pl1.creativeVersion, 2);
  assert(!c.promotions.some(p => p.promotionVersionId === "0da7a00b-0000-4000-8000-000000000002"), "SP2 is Signage only");
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", hour: "numeric", hourCycle: "h23" }).format(new Date(c.at)));
  assert.equal(c.promotions.some(p => p.promotionVersionId === "0da7a00b-0000-4000-8000-000000000001"), hour >= 16 && hour < 19, "SP1 follows its 16–19 JST window");
  assert(c.popular.length > 0 && c.popular[0].orders >= c.popular.at(-1)!.orders);
  assert.equal(c.listings.length, 22);
  // Customers cannot read other customers' orders; popularity is only an aggregate.
  assert.equal(await call<number>("U2", "select count(*)::int as value from orders"), 0);
  await assert.rejects(candidatesOf("U2", visit), code("42501"));
  await assert.rejects(call("W1", "select app_selection_candidates($1::uuid) as value", [visit]), code("42501"));
});
test("U1 (history and cart ON) with pasta: three types, sponsored sauce, replenishment from history; the DB accepts and dedupes the save", async () => {
  const visit = await visitWith("U1", "2900000000100");
  const input = await inputs("U1", visit);
  const sel = selectRecommendations(input, rules);
  assert.deepEqual(new Set(sel.items.map(i => i.placementType)), new Set(["organic", "store_promo", "sponsored"]));
  const ad = sel.items.find(i => i.placementType === "sponsored")!;
  assert.equal(ad.product.productId, SAUCE); assert.equal(ad.reasonText, "スパゲッティを選んだ方への広告です"); assert.equal(ad.adPlacementId, PL1);
  assert(input.summaries.some(s => s.productId === MILK), "seeded history yields purchase cycles");
  // DATA-01 ends on 10/04: a week later the weekly items are due; by now (≥1.5× the interval) the habit has lapsed (#152).
  const dueInput = await inputs("U1", visit, "2026-10-11T12:00:00+09:00");
  const organic = selectRecommendations({ ...dueInput, candidates: { ...dueInput.candidates, ads: [], promotions: [] } }, rules);
  assert(organic.items.some(i => i.reasonCode === "replenishment"), JSON.stringify(organic.items.map(i => i.reasonCode)));
  const id = "0da7a0e2-0000-4000-8000-000000000001";
  assert.equal(await save("U1", sel, id), id);
  assert.equal(await save("U1", sel, id), id, "resending the same selection is a no-op");
  const rows = (await db.query<{ slot: number; placement_type: string; product_id: string }>("select slot,placement_type,product_id from selection_items where selection_id=$1 order by slot", [id])).rows;
  assert.deepEqual(rows.map(r => [r.slot, r.placement_type, r.product_id]), sel.items.map(i => [i.slot, i.placementType, i.product.productId]));
  assert.equal((await db.query("select * from selections where id=$1", [id])).rows.length, 1);
});
test("a selection for an older cart version is rejected by the DB", async () => {
  const visit = await visitWith("U1", "2900000000100");
  const sel = selectRecommendations(await inputs("U1", visit), rules);
  await call("U1", "select app_set_cart_item($1::uuid,gen_random_uuid(),$2::uuid,2,$3::integer,'manual',null) as value", [visit, PASTA, sel.cartVersion]);
  await assert.rejects(save("U1", sel), code("23514"));
});
test("U2 (history and cart OFF): no sponsored, no co_purchase, no replenishment — store pick and popular only", async () => {
  const visit = await visitWith("U2", "2900000000100");
  const sel = selectRecommendations(await inputs("U2", visit), rules);
  assert(sel.items.length > 0);
  assert(sel.items.every(i => ["store_pick", "popular"].includes(i.reasonCode)), JSON.stringify(sel.items.map(i => i.reasonCode)));
  assert(!sel.items.some(i => i.product.productId === PASTA));
  await save("U2", sel);
});
test("a suspended placement disappears from the candidates (and the DB refuses an old selection item for it)", async () => {
  const visit = await visitWith("U1", "2900000000100");
  const before = selectRecommendations(await inputs("U1", visit), rules);
  await db.exec("begin");
  try {
    await db.query("update ad_placements set status='suspended', suspend_reason='検証', suspended_by=$1, suspended_at=now() where id=$2", [userId("T1"), PL1]);
    const claims = { sub: userId("U1"), role: "authenticated", app_metadata: { kago: accounts.U1.kago } };
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
    await db.exec("set local role authenticated");
    const c = (await db.query<{ value: SelectionCandidates }>("select app_selection_candidates($1::uuid) as value", [visit])).rows[0].value;
    assert(!c.ads.some(a => a.adPlacementId === PL1));
    await assert.rejects(db.query("select kago_save_selection($1::uuid,$2::integer,$3::integer,$4::jsonb,null)", [visit, before.cartVersion, 1,
      JSON.stringify([{ slot: 1, rank: 1, placement_type: "sponsored", product_id: SAUCE, ad_placement_id: PL1, reason_code: "sponsored_related", reason_text: "スパゲッティを選んだ方への広告です" }])]), code("23514"));
  } finally { await db.exec("rollback"); }
});
