// #152: the shared regular-purchase definition and the "そろそろ買う頃" reminder list (pure).
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPurchaseSummaries, type ProductPurchaseSummary } from "../src/features/recommendations/customer.ts";
import { cycleRatio, isRegularPurchase, isReplenishmentDue, regularReminders, replenishmentReason, MAX_REMINDERS } from "../src/features/recommendations/purchase-cycle.ts";
import { isRegularPurchase as couponRegular } from "../src/features/offers/targeting.ts";
import type { PurchaseOrder } from "../src/features/account/contracts.ts";

const P = (n: number, name: string, price = 200) => ({ productId: `p${n}`, code: `29000000000${n}`, name, category: "食品", price });
const MILK = P(1, "牛乳"), BREAD = P(2, "食パン"), EGGS = P(3, "たまご"), RICE = P(4, "米");
const s = (product: { productId: string }, count: number, interval: number | null, days: number): ProductPurchaseSummary =>
  ({ productId: product.productId, purchaseCount: count, totalQuantity: count, lastPurchasedAt: "2026-10-18T03:00:00Z", averageIntervalDays: interval, daysSinceLastPurchase: days });

test("one definition: coupon targeting uses the same isRegularPurchase", () => {
  assert.equal(couponRegular, isRegularPurchase);
});

test("boundaries: ≥3 purchases, due from 80% of the interval, lapsed after 1.5×", () => {
  assert.equal(isReplenishmentDue(s(MILK, 3, 7, 5.6)), true);   // 0.8
  assert.equal(isReplenishmentDue(s(MILK, 3, 7, 5.5)), false);  // < 0.8
  assert.equal(isReplenishmentDue(s(MILK, 3, 7, 10.5)), true);  // 1.5 (still regular)
  assert.equal(isReplenishmentDue(s(MILK, 3, 7, 10.6)), false); // habit lapsed
  assert.equal(isReplenishmentDue(s(MILK, 2, 7, 7)), false);    // only twice
  assert.equal(isReplenishmentDue(s(MILK, 4, null, 7)), false);
  assert.equal(cycleRatio(s(MILK, 3, 7, 7)), 1);
});

test("reason text shows the cycle and the elapsed days", () => {
  assert.equal(replenishmentReason(s(MILK, 3, 7, 9.4)), "約7日ごとに購入・前回から9日です");
  assert.equal(replenishmentReason(s(MILK, 3, 0.4, 0.5)), "約1日ごとに購入・前回から1日です");
});

test("reminders: due regular purchases sold now, not in the cart, most overdue first", () => {
  const summaries = [s(MILK, 3, 7, 9), s(BREAD, 4, 7, 6), s(EGGS, 5, 14, 3), s(RICE, 3, 30, 46)]; // rice: 46 of 30 days, the habit lapsed
  const listings = [MILK, BREAD, EGGS, RICE];
  const r = regularReminders(summaries, listings, []);
  assert.deepEqual(r.map(x => [x.product.name, x.status]), [["牛乳", "overdue"], ["食パン", "due"]]);
  assert.equal(r[0].nextDueAt, "2026-10-25T03:00:00.000Z");
  assert.equal(r[0].daysSinceLastPurchase, 9);
  assert.deepEqual(regularReminders(summaries, listings, [MILK.productId]).map(x => x.product.name), ["食パン"]);
  assert.deepEqual(regularReminders(summaries, [BREAD], []).map(x => x.product.name), ["食パン"], "not sold in this store");
  const many = Array.from({ length: 8 }, (_, i) => P(10 + i, `商品${i}`));
  assert.equal(regularReminders(many.map(p => s(p, 3, 7, 7)), many, []).length, MAX_REMINDERS);
});

test("from real orders: weekly milk bought 3 times, visit 8 days after the last one", () => {
  const order = (at: string, items: { productId: string; name: string }[]): PurchaseOrder =>
    ({ id: at, orderedAt: at, total: 0, dataOrigin: "seeded", items: items.map(i => ({ ...i, unitPrice: 200, quantity: 1 })) }) as PurchaseOrder;
  const orders = [order("2026-10-03T03:00:00Z", [{ productId: MILK.productId, name: "牛乳" }]), order("2026-10-10T03:00:00Z", [{ productId: MILK.productId, name: "牛乳" }]),
    order("2026-10-17T03:00:00Z", [{ productId: MILK.productId, name: "牛乳" }, { productId: EGGS.productId, name: "たまご" }])];
  const r = regularReminders(buildPurchaseSummaries(orders, "2026-10-25T03:00:00Z"), [MILK, EGGS], []);
  assert.deepEqual(r.map(x => [x.product.name, x.intervalDays, x.daysSinceLastPurchase, x.status]), [["牛乳", 7, 8, "overdue"]]);
});
