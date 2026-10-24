import type { StoreProduct } from "../cart/contracts";
import type { CouponScore } from "./targeting";

export type OfferKind = "guerrilla_coupon" | "set_deal" | "time_sale";
// One row of app_list_offers (DB: store-defined, active now, not yet claimed in this visit).
export type StoreOffer = {
  offerId: string; kind: OfferKind; headline: string;
  discountPercent: number | null; discountAmount: number | null; unitDiscount: number;
  startsAt: string; endsAt: string;
  product: StoreProduct; trigger: (StoreProduct & { unitDiscount: number }) | null;
  productInCart: boolean; triggerInCart: boolean;
  // DEMO-02 (#116): the customer chose "今回は見送る" for it in this visit. Absent before the 20261025 migration.
  dismissed?: boolean;
};
export type OfferList = {
  visitId: string; cartVersion: number; serverTime: string; nextChangeAt: string | null; offers: StoreOffer[]; cartProductCodes: string[];
  // DEMO-02 (#116): the product that most recently entered the cart (trigger t) and coupons received in this visit.
  lastAddedProduct?: Pick<StoreProduct, "productId" | "code" | "name" | "category"> | null;
  claimedCouponCount?: number;
};
// What the App shows: chosen and ordered on the server with the APP-04 rules.
export type SerendipityOffer = StoreOffer & {
  action: "add" | "apply"; reason: string; discountLabel: string; score: number;
  relation: { ruleId: string; origin: "initial" | "analysis" | "store"; triggeredBy: string | null } | null;
  // Guerrilla coupons only: why this customer got this coupon (score breakdown for #118).
  targeting?: CouponScore;
};
export type SerendipityResponse = {
  visitId: string; cartVersion: number; serverTime: string; nextChangeAt: string | null; ruleVersion: number;
  timeSales: SerendipityOffer[]; coupon: SerendipityOffer | null; sets: SerendipityOffer[];
};
export type OfferEventType = "offer_shown" | "offer_opened" | "offer_dismissed";

export const offerKindLabel: Record<OfferKind, string> = {
  guerrilla_coupon: "ゲリラクーポン", set_deal: "セット割", time_sale: "タイムセール",
};
