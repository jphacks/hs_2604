import testUserData from "@/data/demo/customer.json";

export type CustomerAccount = {
  id: string;
  email: string;
  role: "customer";
  isTestUser: boolean;
};

export type CustomerProfile = {
  displayName: string;
  nameKana: string;
  ageBand: string;
  area: string;
  household: { size: number; adults: number; children: number };
  shoppingPreferences: string[];
  favoriteCategories: string[];
  priceSensitivity: "low" | "medium" | "high";
};

export type PurchaseItem = {
  productCode: string;
  quantity: number;
  unitPrice: number;
};

export type PurchaseRecord = {
  id: string;
  purchasedAt: string;
  storeId: string;
  items: PurchaseItem[];
};

export type DemoCustomer = {
  demoNow: string;
  account: CustomerAccount;
  profile: CustomerProfile;
  purchaseHistory: PurchaseRecord[];
};

export type ProductPurchaseSummary = {
  productCode: string;
  purchaseCount: number;
  totalQuantity: number;
  lastPurchasedAt: string;
  averageIntervalDays: number | null;
  daysSinceLastPurchase: number;
  replenishmentScore: number;
};

export const TEST_CUSTOMER = testUserData as DemoCustomer;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function buildPurchaseSummaries(
  customer: DemoCustomer = TEST_CUSTOMER,
): ProductPurchaseSummary[] {
  const referenceTime = new Date(customer.demoNow).getTime();
  const productEvents = new Map<string, Array<{ purchasedAt: string; quantity: number }>>();

  for (const purchase of customer.purchaseHistory) {
    for (const item of purchase.items) {
      const events = productEvents.get(item.productCode) ?? [];
      events.push({ purchasedAt: purchase.purchasedAt, quantity: item.quantity });
      productEvents.set(item.productCode, events);
    }
  }

  return Array.from(productEvents, ([productCode, events]) => {
    const sortedEvents = [...events].sort(
      (a, b) => new Date(a.purchasedAt).getTime() - new Date(b.purchasedAt).getTime(),
    );
    const intervals = sortedEvents.slice(1).map((event, index) => {
      const previousTime = new Date(sortedEvents[index].purchasedAt).getTime();
      return (new Date(event.purchasedAt).getTime() - previousTime) / DAY_IN_MS;
    });
    const averageIntervalDays = intervals.length > 0
      ? intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length
      : null;
    const lastPurchasedAt = sortedEvents.at(-1)?.purchasedAt ?? customer.demoNow;
    const daysSinceLastPurchase = Math.max(
      0,
      (referenceTime - new Date(lastPurchasedAt).getTime()) / DAY_IN_MS,
    );
    const replenishmentScore = averageIntervalDays
      ? daysSinceLastPurchase / averageIntervalDays + Math.log2(events.length + 1) * 0.25
      : Math.log2(events.length + 1) * 0.2;

    return {
      productCode,
      purchaseCount: events.length,
      totalQuantity: events.reduce((sum, event) => sum + event.quantity, 0),
      lastPurchasedAt,
      averageIntervalDays,
      daysSinceLastPurchase,
      replenishmentScore,
    };
  }).sort((a, b) => b.replenishmentScore - a.replenishmentScore);
}

export const TEST_CUSTOMER_PURCHASE_SUMMARIES = buildPurchaseSummaries();

export function getPersonalizedRecommendationCodes(limit = 5): string[] {
  return TEST_CUSTOMER_PURCHASE_SUMMARIES
    .filter((summary) => summary.purchaseCount >= 2)
    .slice(0, limit)
    .map((summary) => summary.productCode);
}

export function getPersonalizedReason(productCode: string): string {
  const summary = TEST_CUSTOMER_PURCHASE_SUMMARIES.find(
    (item) => item.productCode === productCode,
  );
  if (!summary) return "おすすめの商品です";
  if (
    summary.averageIntervalDays &&
    summary.daysSinceLastPurchase / summary.averageIntervalDays >= 0.8
  ) {
    return "いつもの購入周期から、そろそろです";
  }
  if (summary.purchaseCount >= 4) return "よく購入している商品です";
  return "過去の購入履歴からおすすめします";
}
