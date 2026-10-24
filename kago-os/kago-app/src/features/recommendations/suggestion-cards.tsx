"use client";

import Image from "next/image";
import { SuggestionDetail } from "./suggestion-detail";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/features/cart/cart-provider";
import { useAppEvents } from "@/features/events/event-provider";
import { useImpression } from "@/features/events/use-impression";
import { MENU_PRODUCT_IMAGES, productIcon } from "@/lib/product-visuals";
import type { ReasonCode, SavedSelection, SavedSelectionItem } from "./selection-contracts";
import { useRecommendations } from "./use-recommendations";

type Item = SavedSelectionItem;
const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });

// The label always follows the stored type: store picks and sponsored ads never look like organic picks.
const organicLabel: Record<Exclude<ReasonCode, "store_pick" | "sponsored_related">, string> = {
  co_purchase: "一緒におすすめ", replenishment: "そろそろ補充", popular: "売れ筋",
};
export function suggestionLabel(item: Pick<Item, "placementType" | "reasonCode">) {
  if (item.placementType === "sponsored") return "広告";
  if (item.placementType === "store_promo") return "店舗からのおすすめ";
  return organicLabel[item.reasonCode as keyof typeof organicLabel] ?? "おすすめ";
}
const tone = {
  organic: { card: "border-emerald-100 bg-white", badge: "bg-emerald-700 text-white", art: "bg-emerald-50" },
  store_promo: { card: "border-amber-200 bg-amber-50/40", badge: "bg-amber-400 text-slate-950", art: "bg-amber-50" },
  sponsored: { card: "border-slate-300 bg-slate-50", badge: "bg-slate-700 text-white", art: "bg-white" },
} as const;

export const ROTATE_MS = 4000;
const SLIDE_HEIGHT = 200;
const slideOrder: Record<Item["placementType"], number> = { sponsored: 0, store_promo: 1, organic: 2 };
// Display order of the slides: maker ad, then the store's pick, then personal recommendations (by rank).
export function orderSlides<T extends Pick<Item, "placementType" | "rank">>(items: T[]) {
  return [...items].sort((a, b) => slideOrder[a.placementType] - slideOrder[b.placementType] || a.rank - b.rank);
}

function ProductArt({ item, size }: { item: Item; size: "card" | "detail" }) {
  const image = MENU_PRODUCT_IMAGES[item.product.code];
  return <div className={`relative grid place-items-center overflow-hidden rounded-xl ${tone[item.placementType].art} ${size === "card" ? "h-full text-4xl" : "size-20 shrink-0 text-4xl"}`}>
    {image ? <Image src={image} alt="" fill sizes={size === "card" ? "112px" : "80px"} className="object-cover" />
      : <span aria-hidden="true">{productIcon(item.product)}</span>}
  </div>;
}

// APP-06: shows the slots chosen and saved by APP-05 (GET /api/recommendations). Ranking is never done here.
export function SuggestionCards() {
  const { state, retry, updating } = useRecommendations();
  const [paused, setPaused] = useState(false);
  return <section aria-labelledby="suggestions-heading" aria-busy={state.status === "loading"} className="min-w-0">
    <div className="mb-3 flex items-end justify-between gap-2">
      <div><p className="text-xs font-black tracking-wider text-emerald-700">FOR YOU</p>
        <h2 id="suggestions-heading" className="text-2xl font-black">あなたへのおすすめ</h2></div>
      <span className="hidden shrink-0 text-[11px] text-slate-500 min-[360px]:inline">理由・広告表示つき</span>
    </div>
    {state.status === "loading" && <div role="status" aria-label={updating ? "かごに合わせておすすめを更新しています" : "おすすめを読み込んでいます"} className="flex animate-pulse items-center justify-center rounded-2xl bg-slate-200/70 p-4 text-sm text-slate-600" style={{ height: SLIDE_HEIGHT }}>
      {updating ? "かごに合わせておすすめを更新しています…" : "おすすめを読み込んでいます…"}
    </div>}
    {state.status === "error" && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <p>{state.message}</p>
      <button type="button" onClick={retry} className="mt-3 min-h-11 rounded-xl bg-red-700 px-4 text-sm font-bold text-white">おすすめを再試行</button>
    </div>}
    {state.status === "ready" && state.data.items.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-600">
      いまのかごに合うおすすめはありません。商品をかごに追加すると、関連するおすすめが表示されます。
    </p>}
    {state.status === "ready" && state.data.items.length > 0 && <SuggestionCarousel key={state.data.selectionId} selection={state.data} paused={paused} onPauseChange={setPaused} />}
  </section>;
}

// A fresh selection owns its slide/detail state. Replacing it also closes an obsolete detail dialog.
function SuggestionCarousel({ selection, paused, onPauseChange }: { selection: SavedSelection; paused: boolean; onPauseChange: (paused: boolean) => void }) {
  const cart = useCart();
  const track = useAppEvents();
  const container = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState<Item | null>(null);
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!detail) return;
    closeButton.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setDetail(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [detail]);

  // Auto-rotation: one suggestion at a time, sliding up every few seconds (ad → store pick → personal).
  const slides = orderSlides(selection.items);
  const current = slides.length ? index % slides.length : 0;
  useImpression(container, slides[current], !detail);
  const running = slides.length > 1 && !paused && !hovered && !focused && !detail;
  const go = (step: number) => setIndex(value => (value % Math.max(1, slides.length) + step + slides.length) % Math.max(1, slides.length));
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => { if (!document.hidden) setIndex(value => value + 1); }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [running, slides.length]);

  const inCart = new Set(cart.lines.map(line => line.productId));
  const add = (item: Item) => {
    track({ event_type: "recommendation_click", selection_item_id: item.selectionItemId, product_id: item.product.productId, payload: { target: "add_button" } });
    setDetail(null);
    cart.addRecommendation(item.product.productId, item.selectionItemId);
  };
  const open = (item: Item) => {
    track({ event_type: "recommendation_click", selection_item_id: item.selectionItemId, product_id: item.product.productId, payload: { target: "detail" } });
    setDetail(item);
  };
  return <><div ref={container} role="group" aria-roledescription="カルーセル" aria-label="おすすめ商品" className="relative"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
      <div className="overflow-hidden rounded-2xl" style={{ height: SLIDE_HEIGHT }}>
        <ul className="motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out" style={{ transform: `translateY(-${current * SLIDE_HEIGHT}px)` }}>
          {slides.map((item, index) => {
            const label = suggestionLabel(item);
            const added = inCart.has(item.product.productId);
            const visible = index === current;
            return <li key={item.selectionItemId} aria-roledescription="スライド" aria-label={`${index + 1} / ${slides.length}`} aria-hidden={!visible} inert={!visible}
              style={{ height: SLIDE_HEIGHT }} className="p-0.5">
              <article data-selection-item-id={item.selectionItemId} aria-label={`${label}：${item.product.name}`} className={`flex h-full gap-3 rounded-2xl border p-3 shadow-sm ${tone[item.placementType].card}`}>
                <div className="w-28 shrink-0"><ProductArt item={item} size="card" /></div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${tone[item.placementType].badge}`}>{label}</span>
                    {item.sponsor && <span className="text-[11px] font-bold text-slate-600">提供：{item.sponsor.makerName}</span>}
                  </div>
                  <h3 className="mt-1 line-clamp-2 break-words text-sm font-bold leading-5" title={item.product.name}>{item.product.name}</h3>
                  <p className="text-sm font-black text-emerald-800">{yen.format(item.product.price)}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-slate-600">{item.reasonText}</p>
                  <div className="mt-auto flex gap-2 pt-1">
                    <button type="button" disabled={!cart.canEdit || added} onClick={() => add(item)} aria-label={`${item.product.name}をかごに追加（${label}）`}
                      className="min-h-11 flex-1 rounded-xl bg-slate-950 px-2 text-xs font-black text-white disabled:opacity-40">{added ? "かごに追加済み" : "かごに追加"}</button>
                    <button type="button" onClick={() => open(item)} aria-label={`${item.product.name}の詳細（${label}）`}
                      className="min-h-11 shrink-0 px-1 text-xs font-bold text-emerald-800 underline">詳細</button>
                  </div>
                </div>
              </article>
            </li>;
          })}
        </ul>
      </div>
      {slides.length > 1 && <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {slides.map((item, index) => <span key={item.selectionItemId} className={`h-1.5 rounded-full transition-all ${index === current ? "w-5 bg-emerald-700" : "w-1.5 bg-slate-300"}`} />)}
        </div>
        <p className="sr-only" aria-live={running ? "off" : "polite"}>{current + 1} / {slides.length}：{suggestionLabel(slides[current])}</p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => go(-1)} aria-label="前のおすすめ" className="grid size-11 place-items-center rounded-full text-lg text-slate-700">↑</button>
          <button type="button" onClick={() => go(1)} aria-label="次のおすすめ" className="grid size-11 place-items-center rounded-full text-lg text-slate-700">↓</button>
          <button type="button" onClick={() => onPauseChange(!paused)} aria-pressed={paused}
            aria-label={paused ? "おすすめの自動切り替えを再開" : "おすすめの自動切り替えを停止"} className="min-h-11 rounded-full px-3 text-xs font-bold text-slate-700 underline">{paused ? "再生" : "停止"}</button>
        </div>
      </div>}
    </div>
    {detail && <SuggestionDetail item={detail} label={suggestionLabel(detail)} added={inCart.has(detail.product.productId)} disabled={!cart.canEdit} closeButtonRef={closeButton} onClose={()=>setDetail(null)} onAdd={()=>add(detail)}/>}

  </>;
}
