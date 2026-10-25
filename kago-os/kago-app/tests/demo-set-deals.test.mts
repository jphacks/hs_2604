// #169: demo set deals on the real seeds (PGlite) and the App's own listing (app_list_offers + rankSerendipity).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { createDemoDatabase } from "./fixtures/demo-database.mts";
import { rankSerendipity } from "../src/features/offers/serendipity.ts";
import type { OfferList } from "../src/features/offers/contracts.ts";
import type { AssociationRuleSet } from "../src/features/recommendations/association.ts";

const rules = JSON.parse(await readFile(new URL("../src/features/recommendations/association-rules.json", import.meta.url), "utf8")) as AssociationRuleSet;
const seed = (name: string) => readFile(new URL(`../../kago-core/supabase/seed/${name}`, import.meta.url), "utf8");
const demo = await createDemoDatabase();
after(() => demo.db.close());
await demo.seed();
await demo.db.exec(await seed("app_menu_fresh_products.sql"));
// The seed's fixed demo period is moved around 'now' so the test does not depend on the calendar.
const sets = (await seed("app_demo_set_deals.sql")).replace("'2026-10-25T00:00:00+09'", "now()-interval '1 hour'").replace("'2026-11-07T00:00:00+09'", "now()+interval '1 day'");
const S1 = "0da7a001-0000-4000-8000-000000000001", U1 = "0da7a0aa-0000-4000-8000-000000000001";

test("seed adds five set deals once and keeps them for the demo period", async () => {
  await demo.db.exec(sets); await demo.db.exec(sets);
  const rows = (await demo.db.query<{ n: number }>("select count(*)::int as n from store_offers where id::text like '0de0f007-%' and kind='set_deal' and store_id=$1", [S1])).rows;
  assert.equal(rows[0].n, 5);
});
test("scanning the first product of a pair shows the set deal in the App (pork → pork + cabbage)", async () => {
  const visit = (await demo.db.query<{ id: string }>("insert into visits(user_id,store_id) values ($1,$2) returning id", [U1, S1])).rows[0].id;
  const pork = (await demo.db.query<{ id: string }>("select id from products where code='PLU-5002'")).rows[0].id;
  await demo.db.query("insert into cart_items(visit_id,product_id,quantity) values ($1,$2,1)", [visit, pork]);
  await demo.db.exec("begin");
  await demo.db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: U1, role: "authenticated", app_metadata: { kago: { roles: ["customer"] } } })]);
  await demo.db.exec("set local role authenticated");
  const list = (await demo.db.query<{ value: OfferList }>("select public.app_list_offers($1) as value", [visit])).rows[0].value;
  await demo.db.exec("rollback");
  const shown = rankSerendipity(list, rules).sets;
  assert.deepEqual(shown.map(o => [o.trigger!.code, o.product.code, o.action]), [["PLU-5002", "PLU-4004", "add"]]);
  assert.match(shown[0].reason, /豚こま切れとキャベツを一緒に買うとお得です/);
});
