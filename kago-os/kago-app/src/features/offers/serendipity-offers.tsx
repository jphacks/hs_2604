"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cartRequest, useCart } from "@/features/cart/cart-provider";
import { useShoppingSession } from "@/features/shopping/session-provider";
import { StoreOfferDetail } from "./store-offer-detail";
import { CouponDetail } from "./coupon-detail";
import { CouponArrival } from "./coupon-arrival";
import { CouponRedemption } from "./coupon-redemption";
import { decideCouponAppearance, readCouponAppearance, type CouponAppearance } from "./coupon-appearance";
import { type OfferEventType, type SerendipityOffer, type SerendipityResponse } from "./contracts";

const REFRESH_MS = 60_000;

function readList(key: string): string[] {
  try { const value = JSON.parse(sessionStorage.getItem(key) ?? "[]"); return Array.isArray(value) ? value.filter(v => typeof v === "string") : []; }
  catch { return []; }
}
function writeList(key: string, values: string[]) {
  try { sessionStorage.setItem(key, JSON.stringify(values)); } catch { /* only a display convenience */ }
}

// APP-13: store offers shown as surprises, visibly separate from recommendations and sponsored ads.
// Validity, prices and discounts always come from the DB; this component never computes a charge.
export function SerendipityOffers({renderStoreOffers}:{renderStoreOffers:(offers:SerendipityOffer[],onUse:(offer:SerendipityOffer)=>void,serverTime:string,open:boolean)=>ReactNode}) {
  const cart = useCart();
  const session = useShoppingSession();
  const visitId = session.visit!.id;
  const shownKey = `kago-offers-shown:${session.userId}:${visitId}`;
  const dismissedKey = `kago-offers-dismissed:${session.userId}:${visitId}`;
  const appearanceKey = `kago-coupon-appearance:${session.userId}:${visitId}`;
  const [data, setData] = useState<SerendipityResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [redeeming,setRedeeming]=useState(false);
  const [open, setOpen] = useState<SerendipityOffer | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [visibleCouponId, setVisibleCouponId] = useState<string | null>(null);
  const appearance = useRef<CouponAppearance | null>(null);
  const consumedCoupons = useRef(new Set<string>());
  const request = useRef<AbortController | null>(null);
  const timer = useRef<number | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  const record = (offerId: string, type: OfferEventType) => {
    void cartRequest("/api/offers", { visitId, eventId: crypto.randomUUID(), offerId, type }).catch(() => { /* logging never blocks shopping */ });
  };
  const load = async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    try {
      const next: SerendipityResponse = await cartRequest("/api/offers", undefined, controller.signal);
      if (controller.signal.aborted || next.visitId !== visitId || next.cartVersion !== cart.version) return;
      if (!appearance.current) {
        try { appearance.current = readCouponAppearance(sessionStorage.getItem(appearanceKey)); }
        catch { appearance.current = readCouponAppearance(null); }
      }
      const candidate = next.coupon && !consumedCoupons.current.has(next.coupon.offerId) ? next.coupon.offerId : null;
      const decision = decideCouponAppearance(appearance.current, next.cartVersion, candidate);
      appearance.current = decision;
      try { sessionStorage.setItem(appearanceKey, JSON.stringify(decision)); } catch { /* keep the in-memory decision */ }
      setVisibleCouponId(decision.visible ? decision.offerId : null);
      setData(next); setFailed(false);
      if (timer.current) window.clearTimeout(timer.current);
      // Refresh exactly when a time sale starts or ends, and at least every minute.
      const until = next.nextChangeAt ? Date.parse(next.nextChangeAt) - Date.parse(next.serverTime) + 1000 : REFRESH_MS;
      timer.current = window.setTimeout(() => { void load(); }, Math.max(1000, Math.min(REFRESH_MS, until)));
    } catch (failure) {
      if (controller.signal.aborted) return;
      const code = (failure as { code?: string })?.code;
      if (code === "unauthenticated" || code === "session_expired") session.revalidate();
      else setFailed(true);
    }
  };
  useEffect(() => {
    const boot = window.setTimeout(() => {
      setDismissed(readList(dismissedKey));
      for (const id of readList(dismissedKey)) consumedCoupons.current.add(id);
      void load();
    }, 0);
    return () => { window.clearTimeout(boot); request.current?.abort(); if (timer.current) window.clearTimeout(timer.current); };
    // Reload whenever the saved cart changes (scan, removal, claim) or a cart/claim request is refused
    // (e.g. the offer just ended); the visit boundary unmounts this tree.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.version, cart.error]);

  const coupon = data?.cartVersion === cart.version && data?.coupon && visibleCouponId === data.coupon.offerId
    && !dismissed.includes(data.coupon.offerId) ? data.coupon : null;
  const visible = data ? [...data.timeSales, ...data.sets, ...(coupon ? [coupon] : [])] : [];
  const visibleIds = visible.map(offer => offer.offerId).join(",");
  useEffect(() => {
    if (!visibleIds) return;
    const shown = readList(shownKey);
    const fresh = visibleIds.split(",").filter(id => !shown.includes(id));
    if (!fresh.length) return;
    writeList(shownKey, [...shown, ...fresh]);
    fresh.forEach(id => record(id, "offer_shown"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds]);
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  const claim = (offer: SerendipityOffer) => { setOpen(null); cart.claimOffer(offer.offerId); };
  const openCoupon = (offer: SerendipityOffer) => {
    // #166: opening only shows the details. Closing (×・Escape・背景) returns to the ticket; the coupon leaves
    // the screen only when it is used or explicitly dismissed (「今回は見送る」). offer_opened is stored once by the DB.
    setRedeeming(false);setOpen(offer); record(offer.offerId, "offer_opened");
  };
  const dismiss = (offer: SerendipityOffer) => {
    const next = [...dismissed, offer.offerId]; setDismissed(next); writeList(dismissedKey, next);
    consumedCoupons.current.add(offer.offerId);
    record(offer.offerId, "offer_dismissed"); setOpen(null);
  };
  const storeOffers=data?.cartVersion===cart.version?[...data.timeSales,...data.sets]:[];
  const useStoreOffer=(offer:SerendipityOffer)=>{if(offer.action==="apply")claim(offer);else{setRedeeming(false);setOpen(offer);}};
  return <>
    {renderStoreOffers(storeOffers,useStoreOffer,data?.serverTime??"1970-01-01T00:00:00Z",open!==null)}
    {failed&&<span className="sr-only" role="status">お得情報を取得できませんでした。</span>}
    {coupon && !open && <CouponArrival name={coupon.product.name} discount={coupon.discountLabel} onOpen={()=>openCoupon(coupon)} onDismiss={()=>dismiss(coupon)}/>}
    {open?.kind!=="guerrilla_coupon"&&open&&<StoreOfferDetail offer={open} disabled={!cart.canEdit} onClose={()=>setOpen(null)} onScan={()=>setRedeeming(true)} redemption={redeeming?<CouponRedemption key={open.offerId} offer={open} visitId={visitId} canEdit={cart.canEdit} onClaim={()=>claim(open)}/>:undefined}/>}
    {open?.kind==="guerrilla_coupon" && <CouponDetail appearance={open.kind==="guerrilla_coupon"?"guerrilla":"standard"} offer={open} scanRequired disabled={!cart.canEdit} closeButtonRef={closeButton} onClose={()=>setOpen(null)} onClaim={()=>setRedeeming(true)} onDismiss={()=>dismiss(open)}
      redemption={redeeming?<CouponRedemption key={open.offerId} offer={open} visitId={visitId} canEdit={cart.canEdit} onClaim={()=>claim(open)}/>:undefined}/>}

  </>;
}
