// #152: one definition of "regular purchase" and "due to buy again", shared by the APP-05 replenishment
// slot, the DEMO-02 coupon targeting (regular purchases get no coupon) and the reminder card.
// Pure: only the customer's own purchase summaries (history use ON) and the store's listings.
import type { ProductPurchaseSummary } from "./customer.ts";

export const REGULAR_MIN_PURCHASES = 3;
export const REGULAR_INTERVAL_FACTOR = 1.5; // a habit lapses once 1.5 × the usual interval has passed
export const REPLENISH_RATIO = 0.8;          // "due" when 80% of the usual interval has passed
export const MAX_REMINDERS = 5;
const DAY = 86_400_000;

/** Regular purchase: bought ≥3 times and the last purchase is still within 1.5 × the average interval. */
export function isRegularPurchase(summary: ProductPurchaseSummary) {
  return summary.purchaseCount >= REGULAR_MIN_PURCHASES && summary.averageIntervalDays !== null
    && summary.daysSinceLastPurchase <= summary.averageIntervalDays * REGULAR_INTERVAL_FACTOR;
}

/** Elapsed share of the usual interval (1 = exactly one usual interval since the last purchase). */
export function cycleRatio(summary: ProductPurchaseSummary) {
  // Rounded so float noise (5.6 / 7 = 0.7999…) never decides the boundary.
  return summary.averageIntervalDays ? Math.round(summary.daysSinceLastPurchase / summary.averageIntervalDays * 1e6) / 1e6 : null;
}

/** A regular purchase whose usual interval is 80% or more over. */
export function isReplenishmentDue(summary: ProductPurchaseSummary) {
  const ratio = cycleRatio(summary);
  return isRegularPurchase(summary) && ratio !== null && ratio >= REPLENISH_RATIO;
}

/** "約7日ごとに購入・前回から6日です": the cycle and the elapsed days, both rounded to whole days. */
export function replenishmentReason(summary: ProductPurchaseSummary) {
  const interval = Math.max(1, Math.round(summary.averageIntervalDays ?? 0));
  return `約${interval}日ごとに購入・前回から${Math.round(summary.daysSinceLastPurchase)}日です`;
}

export type ReminderListing = { productId: string; code: string; name: string; category: string; price: number };
export type RegularReminder = {
  product: ReminderListing & { available: true };
  purchaseCount: number;
  intervalDays: number;
  lastPurchasedAt: string;
  daysSinceLastPurchase: number;
  nextDueAt: string;
  ratio: number;
  /** overdue: the usual interval has passed; due: 80–100% of it */
  status: "overdue" | "due";
};

/**
 * Regular purchases that are due, most overdue first. Only products the store sells now and that are
 * not already in the cart; at most five so the card stays a short "don't forget" list.
 */
export function regularReminders(summaries: ProductPurchaseSummary[], listings: ReminderListing[], cartProductIds: Iterable<string>): RegularReminder[] {
  const byId = new Map(listings.map(listing => [listing.productId, listing]));
  const inCart = new Set(cartProductIds);
  return summaries.filter(summary => isReplenishmentDue(summary) && byId.has(summary.productId) && !inCart.has(summary.productId))
    .map(summary => {
      const intervalDays = summary.averageIntervalDays!;
      const ratio = cycleRatio(summary)!;
      return { product: { ...byId.get(summary.productId)!, available: true as const }, purchaseCount: summary.purchaseCount,
        intervalDays: Math.round(intervalDays * 10) / 10, lastPurchasedAt: summary.lastPurchasedAt,
        daysSinceLastPurchase: Math.round(summary.daysSinceLastPurchase),
        nextDueAt: new Date(Date.parse(summary.lastPurchasedAt) + intervalDays * DAY).toISOString(),
        ratio: Math.round(ratio * 100) / 100, status: ratio >= 1 ? "overdue" as const : "due" as const };
    })
    .sort((a, b) => b.ratio - a.ratio || a.product.productId.localeCompare(b.product.productId))
    .slice(0, MAX_REMINDERS);
}
