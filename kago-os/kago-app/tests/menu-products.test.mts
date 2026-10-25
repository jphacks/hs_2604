// #144: fictional fresh products for the menu genres, on the real migrations + DATA-01 (PGlite).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { createDemoDatabase } from "./fixtures/demo-database.mts";
import { productGenre } from "../src/lib/product-genres.ts";

const demo = await createDemoDatabase();
after(() => demo.db.close());
await demo.seed();
const source = await readFile(new URL("../../kago-core/supabase/seed/app_menu_fresh_products.sql", import.meta.url), "utf8");
const S1 = "0da7a001-0000-4000-8000-000000000001";
const listed = async () => (await demo.db.query<{ code: string; category: string; price: number }>(
  "select p.code,p.category,sp.price from products p join store_products sp on sp.product_id=p.id where sp.store_id=$1 and sp.is_active order by p.code", [S1])).rows;

test("seed adds 27 fresh products to the demo store only, is re-runnable, and keeps DATA-01 unchanged", async () => {
  const snapshot = async () => (await demo.db.query(`select
    (select jsonb_agg(to_jsonb(p) order by p.id) from products p where p.code not like 'PLU-4%' and p.code not like 'PLU-5%' and p.code not like 'PLU-6%') as products,
    (select jsonb_agg(to_jsonb(sp) order by sp.store_id, sp.product_id) from store_products sp join products p on p.id=sp.product_id
      where p.code not like 'PLU-4%' and p.code not like 'PLU-5%' and p.code not like 'PLU-6%') as store_products,
    (select jsonb_agg(to_jsonb(o) order by o.id) from orders o) as orders`)).rows[0];
  const baseline = await snapshot();
  const before = await listed();
  await demo.db.exec(source); await demo.db.exec(source);
  const after = await listed();
  assert.equal(after.length, before.length + 27);
  assert.deepEqual(after.filter(r => before.some(b => b.code === r.code)), before, "existing products and prices are unchanged");
  assert.equal((await demo.db.query("select 1 from store_products sp join products p on p.id=sp.product_id where p.code like 'PLU-4%' and sp.store_id<>$1", [S1])).rows.length, 0);
  assert.deepEqual(await snapshot(), baseline, "DATA-01 products, prices and orders are unchanged");
});
test("the demo store menu shows 12 vegetables (9 new + 玉ねぎ・アボカド・生バジル when present), 9 meat and 9 fish", async () => {
  const rows = await listed();
  const count = (genre: string) => rows.filter(r => productGenre(r) === genre).length;
  const legacyVeg = rows.filter(r => ["PLU-1001", "PLU-1003", "2900000000179"].includes(r.code)).length;
  assert.equal(count("vegetable"), 9 + legacyVeg); assert.equal(count("meat"), 9); assert.equal(count("fish"), 9);
  assert.ok(rows.some(r => productGenre(r) === null), "other products stay in the store but are not in the menu");
});
test("a code already used for another product is refused without changes", async () => {
  await demo.db.exec("update products set name='別の商品' where code='PLU-6009'");
  await assert.rejects(demo.db.exec(source), /already used for a different product/);
  await demo.db.exec("rollback");
});
