// Display frequency only. Candidate selection and discount eligibility stay on the server.
// #172: for the demo every eligible coupon is shown. Set below 1 (e.g. 0.4 as in #162) to show later coupons
// only sometimes; the first one is always shown either way.
export const COUPON_APPEARANCE_RATE = 1;
export type CouponAppearance = { hasShown: boolean; cartVersion: number; offerId: string | null; visible: boolean };
export const initialCouponAppearance = (): CouponAppearance => ({ hasShown: false, cartVersion: -1, offerId: null, visible: false });

export function readCouponAppearance(raw: string | null): CouponAppearance {
  try {
    const value = JSON.parse(raw ?? "null");
    if (value && typeof value.hasShown === "boolean" && Number.isSafeInteger(value.cartVersion) && value.cartVersion >= -1
      && (value.offerId === null || typeof value.offerId === "string") && typeof value.visible === "boolean"
      && (!value.visible || (value.hasShown && typeof value.offerId === "string"))) return value;
  } catch { /* unavailable/corrupt storage starts a new in-memory baseline */ }
  return initialCouponAppearance();
}

export function decideCouponAppearance(previous: CouponAppearance, cartVersion: number, offerId: string | null,
  random: () => number = Math.random, rate = COUPON_APPEARANCE_RATE): CouponAppearance {
  // One decision per saved cart version, even if polling returns a different candidate.
  if (cartVersion < previous.cartVersion || (cartVersion === previous.cartVersion && previous.offerId !== null)) return previous;
  if (!offerId) return { ...previous, cartVersion, offerId: null, visible: false };
  const visible = !previous.hasShown || rate >= 1 || random() < rate;
  return { hasShown: previous.hasShown || visible, cartVersion, offerId, visible };
}
