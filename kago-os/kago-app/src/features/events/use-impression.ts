"use client";

import { useEffect, type RefObject } from "react";
import { useAppEvents } from "./event-provider";

// IO includes clipping by the carousel and viewport. Only the current slide is eligible.
export function useImpression(ref: RefObject<HTMLElement | null>, item: { selectionItemId: string; product: { productId: string } } | undefined, enabled: boolean) {
  const track = useAppEvents();
  const selectionItemId = item?.selectionItemId, productId = item?.product.productId;
  useEffect(() => {
    if (!enabled || !selectionItemId || !productId || !ref.current || typeof IntersectionObserver === "undefined") return;
    const target = ref.current.querySelector<HTMLElement>(`[data-selection-item-id="${selectionItemId}"]`);
    if (!target) return;
    let ratio = 0, timer: ReturnType<typeof setTimeout> | undefined, started = 0, recorded = false;
    const clear = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
    const eligible = () => ratio >= 0.5 && !document.hidden && !document.querySelector('[role="dialog"]');
    const update = () => {
      if (!eligible()) { clear(); return; }
      if (timer !== undefined || recorded) return;
      started = performance.now();
      timer = setTimeout(() => {
        // Apply any queued threshold crossings before deciding that the full second elapsed.
        const entries = observer.takeRecords();
        if (entries.some(entry => entry.intersectionRatio < 0.5)) {
          ratio = entries.at(-1)!.intersectionRatio; clear(); update(); return;
        }
        if (entries.length) ratio = entries.at(-1)!.intersectionRatio;
        if (!eligible()) { clear(); return; }
        const visibleMs = Math.floor(performance.now() - started);
        if (visibleMs < 1000) { clear(); update(); return; }
        recorded = true;
        track({ event_type: "recommendation_impression", selection_item_id: selectionItemId, product_id: productId, payload: { visible_ms: visibleMs } });
      }, 1000);
    };
    const observer = new IntersectionObserver(entries => {
      // Process every crossing: a dip below 50% resets even if it is visible again in this batch.
      for (const entry of entries) { ratio = entry.intersectionRatio; update(); }
    }, { threshold: [0, 0.5, 1] });
    observer.observe(target);
    document.addEventListener("visibilitychange", update);
    const dialogs = new MutationObserver(update);
    dialogs.observe(document.body, { childList: true, subtree: true });
    return () => { clear(); observer.disconnect(); dialogs.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, [enabled, selectionItemId, productId, ref, track]);
}
