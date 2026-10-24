import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createCartDatabase, id } from "./fixtures/cart-database.mts";
import type { CartSnapshot } from "../src/features/cart/contracts.ts";

const { db, as, rpc } = await createCartDatabase();
after(() => db.close());
const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;
const snapshot = (visit = 13, user = 3) => rpc("app_get_cart", [id(visit)], user) as Promise<CartSnapshot>;
const set = (request: number, quantity: number, version: number, product = 20, visit = 13, user = 3) =>
  rpc("app_set_cart_item", [id(visit),id(request),id(product),quantity,version,"manual",null], user) as Promise<CartSnapshot & {replayed:boolean}>;

test("catalog is store-specific, includes manual PLU, excludes stopped listings", async () => {
  const a = await rpc("app_list_products", [id(13),"",0]) as {products: {price:number;code:string}[]};
  assert.equal(a.products.length, 2); assert(a.products.some(p => p.code === "PLU-APPLE"));
  const b = await rpc("app_list_products", [id(14),"ミルク",0]) as {products:{price:number}[]};
  assert.equal(b.products[0].price, 298);
  assert.equal((await rpc("app_list_products", [id(13),"%",0]) as {products:unknown[]}).products.length, 0);
});
test("lookup records exactly one success/failure per intent without changing cart", async () => {
  const args = [id(13),id(101),"4900000000016",null];
  assert.deepEqual(await rpc("app_lookup_product",args),await rpc("app_lookup_product",args));
  assert.equal((await rpc("app_lookup_product",[id(13),id(102),"unknown",null]) as {code:string}).code,"product_not_found");
  assert.equal((await rpc("app_lookup_product",[id(13),id(103),"4900000000023",null]) as {code:string}).code,"product_unavailable");
  await rpc("app_lookup_product",[id(13),id(104),null,id(21)]);
  assert.equal((await snapshot()).cart.length,0);
  const rows = (await db.query<{event_type:string;payload:{method?:string}}>("select event_type,payload from events order by event_id")).rows;
  assert.equal(rows.length,4); assert.equal(rows[3].payload.method,"manual");
});
test("add/change/remove save one event and one version; replay never increments", async () => {
  let s = await set(110,1,0); assert.equal(s.cart[0].price,248); assert.equal(s.visit.cart_version,1);
  s = await set(110,1,0); assert.equal(s.replayed,true); assert.equal(s.cart[0].quantity,1); assert.equal(s.visit.cart_version,1);
  s = await set(111,3,1); assert.equal(s.cart[0].quantity,3); assert.equal(s.visit.cart_version,2);
  s = await set(110,1,0); assert.equal(s.cart[0].quantity,3); assert.equal(s.visit.cart_version,2);
  s = await set(112,0,2); assert.equal(s.cart.length,0); assert.equal(s.visit.cart_version,3);
  await set(112,0,2);
  const events = (await db.query<{event_type:string;payload:{quantity_delta:number}}>("select event_type,payload from events where event_type like 'cart_%' order by occurred_at")).rows;
  assert.deepEqual(events.map(e=>e.event_type),["cart_item_added","cart_quantity_changed","cart_item_removed"]);
  assert.deepEqual(events.map(e=>e.payload.quantity_delta),[1,2,-3]);
});
test("camera/read failure is recorded once and never mutates cart", async () => {
  const args=[id(13),id(105),null,null,"permission_denied"];
  assert.equal((await rpc("app_lookup_product",args) as {code:string}).code,"scan_failed");
  await rpc("app_lookup_product",args);
  const rows=(await db.query<{event_type:string;payload:{reason:string}}>("select event_type,payload from events where event_id=$1",[id(105)])).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].payload.reason,"permission_denied");
  assert.equal((await snapshot()).cart.length,0);
});
test("same quantity is a remembered no-op and conflicting keys/versions cannot overwrite", async () => {
  await set(120,0,3); assert.equal((await snapshot()).visit.cart_version,3);
  await assert.rejects(set(120,1,3),code("23505"));
  await assert.rejects(set(121,1,2),code("40001"));
  assert.equal((await snapshot()).cart.length,0);
});
test("stopped/unknown/foreign-store products and invalid quantities are refused", async () => {
  await assert.rejects(set(130,1,3,22),code("P0001"));
  await assert.rejects(set(131,1,3,99),code("P0001"));
  await assert.rejects(set(132,1,0,21,14),code("P0001"));
  await assert.rejects(set(133,-1,3),code("22023"));
  await assert.rejects(set(134,1000,3),code("22023"));
  assert.equal((await snapshot()).visit.cart_version,3);
});
test("only the authenticated customer owns the visit; direct writes and receipt reads stay denied", async () => {
  await assert.rejects(snapshot(13,4),code("42501"));
  await assert.rejects(set(140,1,3,20,13,4),code("42501"));
  await assert.rejects(rpc("app_get_cart",[id(13)],3,"maker_staff"),code("42501"));
  await assert.rejects(as(3,()=>db.exec("select * from app_cart_requests")),code("42501"));
  await assert.rejects(as(3,()=>db.exec("delete from cart_items")),code("42501"));
  await assert.rejects(rpc("app_lookup_product",[id(15),id(101),"4900000000016",null],4),code("23505"));
  assert.equal((await snapshot(15,4)).cart.length,0);
});
test("event failure rolls back cart and version and leaves the same request retryable", async () => {
  await db.exec("create function pg_temp.fail_cart_event() returns trigger language plpgsql as $$ begin if new.event_type like 'cart_%' then raise exception 'test'; end if; return new; end $$; create trigger fail_cart_event before insert on events for each row execute function pg_temp.fail_cart_event()");
  await assert.rejects(set(150,1,3));
  assert.equal((await snapshot()).cart.length,0); assert.equal((await snapshot()).visit.cart_version,3);
  await db.exec("drop trigger fail_cart_event on events");
  assert.equal((await set(150,1,3)).visit.cart_version,4);
});
test("a listing stopped after adding remains visible and removable", async () => {
  await db.query("update store_products set is_active=false where store_id=$1 and product_id=$2",[id(1),id(20)]);
  assert.equal((await snapshot()).cart[0].available,false);
  await assert.rejects(set(160,2,4),code("P0001"));
  assert.equal((await set(161,0,4)).cart.length,0);
  await db.query("update store_products set is_active=true where store_id=$1 and product_id=$2",[id(1),id(20)]);
});
test("forged recommendation references do not create cart or event", async () => {
  await assert.rejects(rpc("app_set_cart_item",[id(13),id(170),id(20),1,5,"recommendation",id(999)]),code("42501"));
  assert.equal((await snapshot()).cart.length,0);
});
test("competing expected versions yield only one accepted write", async () => {
  const outcomes=await Promise.allSettled([set(180,1,5),set(181,2,5)]);
  assert.equal(outcomes.filter(r=>r.status==="fulfilled").length,1);
  assert.equal((await snapshot()).cart[0].quantity,1);
  // SQL serialization is tested above; PGlite serializes calls, not a multi-connection stress test.
});
test("DB-07 checkout consumes the updated cart version and closes further writes", async () => {
  const s=await snapshot();
  const order=await rpc("kago_checkout",[id(13),id(190),s.visit.cart_version,248]) as {total:number};
  assert.equal(order.total,248);
  await assert.rejects(set(191,2,s.visit.cart_version),code("P0001"));
});
test("catalog pagination does not hide products beyond the first page", async () => {
  for(let n=0;n<51;n++) {
    await db.query("insert into products(id,code,name,category) values ($1,$2,$3,'検証')",[id(1000+n),`PAGE-${n}`,`ページ商品${String(n).padStart(2,"0")}`]);
    await db.query("insert into store_products(store_id,product_id,price) values ($1,$2,100)",[id(2),id(1000+n)]);
  }
  const first=await rpc("app_list_products",[id(14),"ページ",0]) as {products:{productId:string}[];hasMore:boolean};
  const last=await rpc("app_list_products",[id(14),"ページ",50]) as {products:{productId:string}[];hasMore:boolean};
  assert.equal(first.products.length,50);assert.equal(first.hasMore,true);
  assert.equal(last.products.length,1);assert.equal(last.hasMore,false);
  assert(!first.products.some(p=>p.productId===last.products[0].productId));
});
test("anonymous users cannot execute the cart functions", async () => {
  await db.exec("begin; set local role anon");
  try {await assert.rejects(db.query("select app_get_cart($1)",[id(14)]),code("42501"));}
  finally {await db.exec("rollback");}
});
