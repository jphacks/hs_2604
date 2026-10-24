"use client";

import { useEffect, useRef, useState } from "react";
import { cartRequest, useCart } from "@/features/cart/cart-provider";
import { useShoppingSession } from "@/features/shopping/session-provider";
import { productIcon } from "@/lib/product-visuals";
import { CouponDetail } from "./coupon-detail";
import { CouponArrival } from "./coupon-arrival";
import { CouponRedemption } from "./coupon-redemption";
import { decideCouponAppearance, readCouponAppearance, type CouponAppearance } from "./coupon-appearance";
import { type OfferEventType, type SerendipityOffer, type SerendipityResponse } from "./contracts";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });
const clockFormat = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });
// "17:30", or "10/26 17:30" when the time is not today (JST).
const clock = { format: (at: Date) => (dayFormat.format(at) === dayFormat.format(new Date()) ? "" : `${dayFormat.format(at)} `) + clockFormat.format(at) };
const REFRESH_MS = 60_000;
const button = "min-h-11 rounded-xl px-4 py-2 text-sm font-black disabled:opacity-40";

function readList(key: string): string[] {
  try { const value = JSON.parse(sessionStorage.getItem(key) ?? "[]"); return Array.isArray(value) ? value.filter(v => typeof v === "string") : []; }
  catch { return []; }
}
function writeList(key: string, values: string[]) {
  try { sessionStorage.setItem(key, JSON.stringify(values)); } catch { /* only a display convenience */ }
}

// APP-13: store offers shown as surprises, visibly separate from recommendations and sponsored ads.
// Validity, prices and discounts always come from the DB; this component never computes a charge.
export function SerendipityOffers() {
  const cart = useCart();
  const session = useShoppingSession();
  const visitId = session.visit!.id;
  const shownKey = `kago-offers-shown:${session.userId}:${visitId}`;
  const dismissedKey = `kago-offers-dismissed:${session.userId}:${visitId}`;
  const openedKey = `kago-offers-opened:${session.userId}:${visitId}`;
  const appearanceKey = `kago-coupon-appearance:${session.userId}:${visitId}`;
  const [data, setData] = useState<SerendipityResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [redeeming,setRedeeming]=useState(false);
  const [open, setOpen] = useState<SerendipityOffer | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [opened, setOpened] = useState<string[]>([]);
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
      // Keep the in-memory choice when storage is unavailable during a cart refresh.
      setOpened(previous => [...new Set([...previous, ...readList(openedKey)])]);
      for (const id of [...readList(openedKey), ...readList(dismissedKey)]) consumedCoupons.current.add(id);
      void load();
    }, 0);
    return () => { window.clearTimeout(boot); request.current?.abort(); if (timer.current) window.clearTimeout(timer.current); };
    // Reload whenever the saved cart changes (scan, removal, claim) or a cart/claim request is refused
    // (e.g. the offer just ended); the visit boundary unmounts this tree.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.version, cart.error]);

  const coupon = data?.cartVersion === cart.version && data?.coupon && visibleCouponId === data.coupon.offerId
    && !dismissed.includes(data.coupon.offerId) && !opened.includes(data.coupon.offerId) ? data.coupon : null;
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
    // Opening consumes the sticker for this customer/visit/tab, without declining the offer.
    const next = [...opened, offer.offerId]; setOpened(next); writeList(openedKey, next);
    consumedCoupons.current.add(offer.offerId);
    setRedeeming(false);setOpen(offer); record(offer.offerId, "offer_opened");
  };
  const dismiss = (offer: SerendipityOffer) => {
    const next = [...dismissed, offer.offerId]; setDismissed(next); writeList(dismissedKey, next);
    consumedCoupons.current.add(offer.offerId);
    record(offer.offerId, "offer_dismissed"); setOpen(null);
  };
  if (!data || (!data.timeSales.length && !data.sets.length && !coupon && !open)) {
    return failed ? <p className="text-xs text-slate-500" role="status">お得情報を取得できませんでした。通信が戻ると自動で再表示します。</p> : null;
  }

  return <>
    {(data.timeSales.length > 0 || data.sets.length > 0) && <section aria-labelledby="offers-heading" className="grid gap-3">
      <div><p className="text-xs font-black tracking-wider text-orange-600">STORE DEALS</p>
        <h2 id="offers-heading" className="text-2xl font-black">いまだけのお得</h2>
        <p className="mt-1 text-xs text-slate-500">店舗が実施しているセール・セット割です（おすすめ・広告とは別枠）。</p></div>
      {data.timeSales.map(offer => <article key={offer.offerId} aria-label={`タイムセール ${offer.headline}`} className="rounded-2xl border-2 border-orange-300 bg-gradient-to-br from-orange-50 to-amber-50 p-4 shadow-sm">
        <p className="text-sm font-black text-orange-700"><span aria-hidden="true">⏰ </span>タイムセール開始！ <time dateTime={offer.startsAt}>{clock.format(new Date(offer.startsAt))}</time>〜<time dateTime={offer.endsAt}>{clock.format(new Date(offer.endsAt))}</time></p>
        <div className="mt-2 flex items-center gap-3"><span className="grid size-14 shrink-0 place-items-center rounded-xl bg-white text-3xl" aria-hidden="true">{productIcon(offer.product)}</span>
          <div className="min-w-0"><h3 className="font-black">{offer.headline}</h3><p className="text-sm">{offer.product.name}</p>
            <p className="mt-1 text-sm"><span className="text-slate-500 line-through">{yen.format(offer.product.price)}</span> <span className="text-lg font-black text-orange-700">{yen.format(offer.product.price - offer.unitDiscount)}</span> <span className="text-xs font-bold">（{offer.discountLabel}）</span></p></div></div>
        <p className="mt-2 text-xs text-slate-600">{offer.reason}。終了後に追加した分はセール対象外です。</p>
        <button type="button" disabled={!cart.canEdit} onClick={() => {if(offer.action==="apply")claim(offer);else{setRedeeming(true);setOpen(offer);}}} className={`${button} mt-3 w-full bg-orange-600 text-white`}>{offer.action === "apply" ? "かごの商品をセール価格にする" : "商品をスキャンして使う"}</button>
      </article>)}
      {data.sets.map(offer => <article key={offer.offerId} aria-label={`セット割 ${offer.headline}`} className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-black text-emerald-700"><span aria-hidden="true">🍝 </span>セットでお得</p>
        <h3 className="mt-1 font-black">{offer.trigger!.name} ＋ {offer.product.name}</h3>
        <p className="mt-1 text-sm">2点一緒に買うと<strong>それぞれ{offer.discountLabel}</strong>（1セットあたり {yen.format(offer.unitDiscount + offer.trigger!.unitDiscount)} 引き）</p>
        <p className="mt-1 text-xs text-slate-600">{offer.reason}。どちらかをかごから外すとセット割は外れます。</p>
        <button type="button" disabled={!cart.canEdit} onClick={() => {if(offer.action==="apply")claim(offer);else{setRedeeming(true);setOpen(offer);}}} className={`${button} mt-3 w-full bg-emerald-700 text-white`}>{offer.action === "apply" ? "セット割を適用" : `${offer.product.name}をスキャンして使う`}</button>
      </article>)}
    </section>}
    {coupon && !open && <CouponArrival name={coupon.product.name} discount={coupon.discountLabel} onOpen={()=>openCoupon(coupon)} onDismiss={()=>dismiss(coupon)}/>}
    {open && <CouponDetail appearance={open.kind==="guerrilla_coupon"?"guerrilla":"standard"} offer={open} scanRequired disabled={!cart.canEdit} closeButtonRef={closeButton} onClose={()=>setOpen(null)} onClaim={()=>setRedeeming(true)} onDismiss={()=>dismiss(open)}
      redemption={redeeming?<CouponRedemption key={open.offerId} offer={open} visitId={visitId} canEdit={cart.canEdit} onClaim={()=>claim(open)}/>:undefined}/>}

  </>;
}
