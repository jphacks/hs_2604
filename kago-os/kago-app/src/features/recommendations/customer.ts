import type { PurchaseOrder } from "../account/contracts.ts";

export type ProductPurchaseSummary = {
  productId: string; purchaseCount: number; totalQuantity: number; lastPurchasedAt: string;
  averageIntervalDays: number | null; daysSinceLastPurchase: number;
};

// Pure input preparation for APP-05. Never fall back to a fixed demo user/history.
// A test can provide demoNow explicitly; production passes the server-derived visit start.
export function buildPurchaseSummaries(orders: PurchaseOrder[], referenceTime: string): ProductPurchaseSummary[] {
  const at = Date.parse(referenceTime);
  if (!Number.isFinite(at)) throw new Error("A valid reference time is required");
  const events = new Map<string, { at: string; quantity: number }[]>();
  for (const order of orders) {
    if (Date.parse(order.orderedAt) >= at) continue;
    for (const item of order.items) {
      const previous = events.get(item.productId) ?? [];
      previous.push({ at: order.orderedAt, quantity: item.quantity }); events.set(item.productId, previous);
    }
  }
  return Array.from(events, ([productId, purchases]) => {
    purchases.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const lastPurchasedAt = purchases.at(-1)!.at;
    const averageIntervalDays = purchases.length < 2 ? null
      : (Date.parse(lastPurchasedAt) - Date.parse(purchases[0].at)) / (purchases.length - 1) / 86_400_000;
    return { productId, purchaseCount: purchases.length, totalQuantity: purchases.reduce((sum, item) => sum + item.quantity, 0),
      lastPurchasedAt, averageIntervalDays, daysSinceLastPurchase: Math.max(0, (at - Date.parse(lastPurchasedAt)) / 86_400_000) };
  });
}
