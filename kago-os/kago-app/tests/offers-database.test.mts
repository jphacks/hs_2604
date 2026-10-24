// APP-13: offers, claims, discounts and checkout on the real migrations (PGlite).
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createCartDatabase, id } from "./fixtures/cart-database.mts";
import { OFFER, PRODUCT, seedOffers } from "./fixtures/offers.mts";

const database = await createCartDatabase();
const { db, as, rpc } = database;
await seedOffers(database);
after(() => db.close());

type Line = { productId: string; price: number; quantity: number; discount: number; offerId: string | null; offerKind: string | null };
type Cart = { visit: { cart_version: number }; cart: Line[]; discountTotal: number; claimedOfferIds: string[] };
type OfferList = { offers: { offerId: string; kind: string; unitDiscount: number; productInCart: boolean; triggerInCart: boolean; trigger: { unitDiscount: number } | null; dismissed: boolean }[]; nextChangeAt: string | null };
const code = (expected: string, detail?: string) => (error: unknown) => {
  const e = error as { code?: string; detail?: string };
  return e.code === expected && (detail === undefined || e.detail === detail);
};
let request = 1000;
const next = () => id(++request);
const cart = (visit = 13, user = 3) => rpc("app_get_cart", [id(visit)], user) as Promise<Cart>;
const offers = (visit = 13, user = 3) => rpc("app_list_offers", [id(visit)], user) as Promise<OfferList>;
const set = async (product: string, quantity: number, visit = 13, user = 3) =>
  rpc("app_set_cart_item", [id(visit), next(), product, quantity, (await cart(visit, user)).visit.cart_version, "manual", null], user) as Promise<Cart>;
const claim = async (offer: string, visit = 13, user = 3, requestId = next()) =>
  rpc("app_claim_offer", [id(visit), requestId, offer, (await cart(visit, user)).visit.cart_version], user) as Promise<Cart & { replayed: boolean }>;
const line = (c: Cart, product: string) => c.cart.find(l => l.productId === product);
const total = (c: Cart) => c.cart.reduce((n, l) => n + l.price * l.quantity, 0) - c.discountTotal;

let visitNo = 60;
// Every test starts on a fresh active visit of user 3 in store 1 (claims are per visit).
beforeEach(async () => {
  visitNo++;
  await db.query("update visits set status='abandoned', ended_at=now() where user_id=$1 and store_id=$2 and status='active'", [id(3), id(1)]);
  await db.query("insert into visits(id,user_id,store_id) values ($1,$2,$3)", [id(visitNo), id(3), id(1)]);
});

test("store-only offers in their window are listed; coupons/sets need the trigger in the cart", async () => {
  const before = await offers(visitNo);
  const ids = before.offers.map(o => o.offerId);
  assert(ids.includes(OFFER.timeSale) && ids.includes(OFFER.coupon) && ids.includes(OFFER.untriggered));
  assert(!ids.includes(OFFER.future) && !ids.includes(OFFER.ended) && !ids.includes(OFFER.otherStore));
  assert.equal(before.offers.find(o => o.offerId === OFFER.coupon)!.triggerInCart, false);
  assert(before.nextChangeAt, "the next start/end lets the App refresh exactly when a sale begins");
  await assert.rejects(claim(OFFER.coupon, visitNo), code("P0001", "trigger_missing"));
  await assert.rejects(claim(OFFER.future, visitNo), code("P0001", "offer_unavailable"));
  await assert.rejects(claim(OFFER.ended, visitNo), code("P0001", "offer_unavailable"));
  await assert.rejects(claim(OFFER.otherStore, visitNo), code("P0001", "offer_unavailable"));
  assert.equal((await cart(visitNo)).cart.length, 0);
});
test("guerrilla coupon: pasta triggers it, the claim adds basil with 25% off one unit and versioned events", async () => {
  await set(PRODUCT.pasta, 1, visitNo);
  const list = await offers(visitNo);
  const coupon = list.offers.find(o => o.offerId === OFFER.coupon)!;
  assert.equal(coupon.triggerInCart, true); assert.equal(coupon.unitDiscount, 49);
  const claimed = await claim(OFFER.coupon, visitNo);
  assert.equal(claimed.visit.cart_version, 2);
  assert.deepEqual(claimed.claimedOfferIds, [OFFER.coupon]);
  assert.equal(line(claimed, PRODUCT.basil)!.discount, 49); assert.equal(line(claimed, PRODUCT.basil)!.offerKind, "guerrilla_coupon");
  assert.equal(claimed.discountTotal, 49);
  assert(!(await offers(visitNo)).offers.some(o => o.offerId === OFFER.coupon), "a claimed offer is not shown again");
  await set(PRODUCT.basil, 3, visitNo);
  assert.equal(line(await cart(visitNo), PRODUCT.basil)!.discount, 49, "a coupon discounts one unit only");
  const event = (await db.query<{ payload: { offer_id: string; source: string } }>(
    "select payload from events where visit_id=$1 and event_type='cart_item_added' and product_id=$2", [id(visitNo), PRODUCT.basil])).rows;
  assert.equal(event.length, 1); assert.equal(event[0].payload.offer_id, OFFER.coupon);
  await assert.rejects(claim(OFFER.coupon, visitNo), code("P0001", "offer_claimed"));
});
test("set deal: needs both products; removing one cancels the discount, re-adding restores it", async () => {
  await set(PRODUCT.pasta, 2, visitNo);
  const c = await claim(OFFER.set, visitNo);
  assert.equal(line(c, PRODUCT.sauce)!.quantity, 1);
  assert.equal(line(c, PRODUCT.sauce)!.discount, 29); assert.equal(line(c, PRODUCT.pasta)!.discount, 24, "one set = one unit of each");
  await set(PRODUCT.sauce, 2, visitNo);
  assert.equal((await cart(visitNo)).discountTotal, 2 * 29 + 2 * 24);
  let after = await set(PRODUCT.sauce, 0, visitNo);
  assert.equal(after.discountTotal, 0); assert.equal(line(after, PRODUCT.pasta)!.discount, 0);
  after = await set(PRODUCT.sauce, 1, visitNo);
  assert.equal(after.discountTotal, 29 + 24);
});
test("time sale applies to all units, can be claimed for an item already in the cart, and checkout charges the same total", async () => {
  await set(PRODUCT.karaage, 2, visitNo);
  const c = await claim(OFFER.timeSale, visitNo);
  assert.equal(line(c, PRODUCT.karaage)!.quantity, 2, "no duplicate add");
  assert.equal(line(c, PRODUCT.karaage)!.discount, 2 * 43);
  await set(PRODUCT.pasta, 1, visitNo); const withCoupon = await claim(OFFER.coupon, visitNo);
  const expected = total(withCoupon);
  assert.equal(expected, 218 * 2 - 86 + 248 + 198 - 49);
  await assert.rejects(rpc("kago_checkout", [id(visitNo), next(), withCoupon.visit.cart_version, expected + 86]), code("40001"));
  const key = next();
  const order = await rpc("kago_checkout", [id(visitNo), key, withCoupon.visit.cart_version, expected]) as { total: number; order_id: string };
  assert.equal(order.total, expected);
  const discounts = (await db.query<{ product_id: string; amount: number; offer_id: string }>("select product_id,amount,offer_id from order_discounts where order_id=$1 order by amount", [order.order_id])).rows;
  assert.deepEqual(discounts.map(d => [d.offer_id, d.amount]), [[OFFER.coupon, 49], [OFFER.timeSale, 86]]);
  const items = (await db.query<{ s: number }>("select sum(unit_price*quantity)::int as s from order_items where order_id=$1", [order.order_id])).rows[0].s;
  assert.equal(items - 135, expected, "order items keep list prices; total = items - discounts");
  const replay = await rpc("kago_checkout", [id(visitNo), key, withCoupon.visit.cart_version, expected]) as { replayed: boolean; total: number };
  assert.equal(replay.replayed, true); assert.equal(replay.total, expected);
});
test("a claim made during the sale is honoured after it ends; no new claim after the end", async () => {
  await db.query(`insert into store_offers(id,store_id,kind,product_id,discount_amount,headline,starts_at,ends_at)
    values ($1,$2,'time_sale',$3,30,'短いセール',now()-interval '1 minute',clock_timestamp()+interval '1500 milliseconds')`, [id(47 + visitNo), id(1), PRODUCT.basil]);
  const c = await claim(id(47 + visitNo), visitNo);
  assert.equal(line(c, PRODUCT.basil)!.discount, 30);
  await delay(1700);
  assert.equal(line(await cart(visitNo), PRODUCT.basil)!.discount, 30);
  assert(!(await offers(visitNo)).offers.some(o => o.offerId === id(47 + visitNo)));
  visitNo++;
  await db.query("update visits set status='abandoned', ended_at=now() where id=$1", [id(visitNo - 1)]);
  await db.query("insert into visits(id,user_id,store_id) values ($1,$2,$3)", [id(visitNo), id(3), id(1)]);
  await assert.rejects(claim(id(46 + visitNo), visitNo), code("P0001", "offer_unavailable"));
});
test("claims are idempotent per request id, version-checked, and never touch another customer's visit", async () => {
  await set(PRODUCT.pasta, 1, visitNo);
  const version = (await cart(visitNo)).visit.cart_version; const key = next();
  const first = await rpc("app_claim_offer", [id(visitNo), key, OFFER.coupon, version]) as Cart & { replayed: boolean };
  const again = await rpc("app_claim_offer", [id(visitNo), key, OFFER.coupon, version]) as Cart & { replayed: boolean };
  assert.equal(again.replayed, true); assert.equal(again.visit.cart_version, first.visit.cart_version);
  await assert.rejects(rpc("app_claim_offer", [id(visitNo), key, OFFER.set, version]), code("23505"));
  await assert.rejects(rpc("app_claim_offer", [id(visitNo), next(), OFFER.set, version]), code("40001"));
  await assert.rejects(rpc("app_claim_offer", [id(visitNo), next(), OFFER.set, first.visit.cart_version], 4), code("42501"));
  await assert.rejects(rpc("app_list_offers", [id(visitNo)], 4), code("42501"));
  await assert.rejects(rpc("app_claim_offer", [id(visitNo), next(), OFFER.set, first.visit.cart_version], 5, "maker_staff"), code("42501"));
});
test("stopped offers disappear and cannot be claimed; offer terms are frozen", async () => {
  await db.query(`insert into store_offers(id,store_id,kind,product_id,discount_percent,headline,starts_at,ends_at)
    values ($1,$2,'time_sale',$3,10,'停止する施策',now()-interval '1 hour',now()+interval '1 hour')`, [id(90 + visitNo), id(1), PRODUCT.sauce]);
  await db.query("update store_offers set status='inactive' where id=$1", [id(90 + visitNo)]);
  assert(!(await offers(visitNo)).offers.some(o => o.offerId === id(90 + visitNo)));
  await assert.rejects(claim(id(90 + visitNo), visitNo), code("P0001", "offer_unavailable"));
  await assert.rejects(db.query("update store_offers set discount_percent=90 where id=$1", [OFFER.coupon]), code("23514"));
  await assert.rejects(db.query("update store_offers set status='active' where id=$1", [id(90 + visitNo)]), code("23514"));
});
test("RLS: customers cannot read or write offers/claims; only own-store staff can create and stop", async () => {
  await db.query("insert into auth.users(id,email) values ($1,'staff6@example.test') on conflict do nothing", [id(6)]);
  await db.query("insert into store_members(store_id,user_id) values ($1,$2) on conflict do nothing", [id(1), id(6)]);
  assert.equal((await as(3, () => db.query("select * from store_offers"))).rows.length, 0);
  await assert.rejects(as(3, () => db.query("select * from visit_offer_claims")), code("42501"));
  await assert.rejects(as(3, () => db.query("insert into visit_offer_claims(visit_id,offer_id,request_id,claimed_at) values ($1,$2,$3,now())", [id(visitNo), OFFER.set, next()])), code("42501"));
  await assert.rejects(as(3, () => db.query(`insert into store_offers(store_id,kind,product_id,discount_percent,headline,starts_at,ends_at)
    values ($1,'time_sale',$2,90,'不正',now(),now()+interval '1 hour')`, [id(1), PRODUCT.sauce])), code("42501"));
  const staffRead = await as(6, () => db.query<{ id: string }>("select id from store_offers"), "store_staff");
  assert(staffRead.rows.length >= 5 && !staffRead.rows.some(r => r.id === OFFER.otherStore));
  await as(6, () => db.query(`insert into store_offers(store_id,kind,product_id,discount_percent,headline,starts_at,ends_at)
    values ($1,'time_sale',$2,15,'店舗が設定したセール',now()+interval '1 day',now()+interval '2 days')`, [id(1), PRODUCT.sauce]), "store_staff");
  await assert.rejects(as(6, () => db.query(`insert into store_offers(store_id,kind,product_id,discount_percent,headline,starts_at,ends_at)
    values ($1,'time_sale',$2,15,'他店',now(),now()+interval '1 hour')`, [id(2), PRODUCT.pasta]), "store_staff"), code("42501"));
  const stopped = await as(6, () => db.query("update store_offers set status='inactive' where id=$1 returning id", [OFFER.otherStore]), "store_staff");
  assert.equal(stopped.rows.length, 0, "other store's offer is invisible to update");
});
test("offer events are recorded once per id for the caller's own visit", async () => {
  const eventId = next();
  await rpc("app_record_offer_event", [id(visitNo), eventId, OFFER.timeSale, "offer_shown"]);
  await rpc("app_record_offer_event", [id(visitNo), eventId, OFFER.timeSale, "offer_shown"]);
  await assert.rejects(rpc("app_record_offer_event", [id(visitNo), eventId, OFFER.timeSale, "offer_opened"]), code("23505"));
  await assert.rejects(rpc("app_record_offer_event", [id(visitNo), next(), OFFER.otherStore, "offer_shown"]), code("P0001", "offer_unavailable"));
  await assert.rejects(rpc("app_record_offer_event", [id(visitNo), next(), OFFER.timeSale, "offer_shown"], 4), code("42501"));
  assert.equal((await db.query("select * from offer_events where event_id=$1", [eventId])).rows.length, 1);
});
test("DEMO-02 inputs: last product put in the cart, own dismissals and received coupons; nothing of another customer", async () => {
  let list = await offers(visitNo) as OfferList & { lastAddedProduct: { code: string } | null; claimedCouponCount: number };
  assert.equal(list.lastAddedProduct, null); assert.equal(list.claimedCouponCount, 0);
  assert.ok(list.offers.every(o => o.dismissed === false));
  await set(PRODUCT.pasta, 1, visitNo); await delay(5); await set(PRODUCT.karaage, 1, visitNo);
  await set(PRODUCT.pasta, 3, visitNo); // a quantity change does not make pasta the "last added" product again
  list = await offers(visitNo) as typeof list;
  assert.equal(list.lastAddedProduct?.code, "PLU-2002");
  await rpc("app_record_offer_event", [id(visitNo), next(), OFFER.coupon, "offer_dismissed"]);
  await claim(OFFER.coupon, visitNo);
  list = await offers(visitNo) as typeof list;
  assert.equal(list.lastAddedProduct?.code, "2900000000179", "the claimed coupon put basil into the cart");
  assert.equal(list.claimedCouponCount, 1);
  // Another customer's dismissal of the same offer is not visible as theirs, and their visit is refused.
  await db.query("insert into visits(id,user_id,store_id) values ($1,$2,$3)", [id(99), id(4), id(1)]);
  const other = await offers(99, 4) as typeof list;
  assert.equal(other.offers.find(o => o.offerId === OFFER.coupon)?.dismissed, false);
  assert.equal(other.claimedCouponCount, 0);
  await assert.rejects(offers(visitNo, 4), code("42501"));
});
