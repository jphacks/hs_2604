"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cartRequest, useCart } from "@/features/cart/cart-provider";
import { useShoppingSession } from "@/features/shopping/session-provider";
import { RecommendationRefresh, sameRecommendationScope, type RecommendationState } from "./refresh";

export function useRecommendations() {
  const cart = useCart();
  const session = useShoppingSession();
  const visitId = session.visit!.id;
  const [state, setState] = useState<RecommendationState>({ status: "loading", scope: null });
  const refresh = useRef<RecommendationRefresh | null>(null);
  const callbacks = useRef({ reloadCart: cart.reload, revalidateSession: session.revalidate });
  useEffect(() => { callbacks.current = { reloadCart: cart.reload, revalidateSession: session.revalidate }; }, [cart.reload, session.revalidate]);
  useEffect(() => {
    const loader = new RecommendationRefresh({
      load: signal => cartRequest("/api/recommendations", undefined, signal), publish: setState,
      reloadCart: () => callbacks.current.reloadCart(), revalidateSession: () => callbacks.current.revalidateSession(),
    });
    refresh.current = loader;
    return () => { loader.stop(); refresh.current = null; };
  }, [visitId]);
  useEffect(() => {
    refresh.current?.update(cart.loaded ? { visitId, cartVersion: cart.version } : null);
  }, [visitId, cart.version, cart.loaded]);
  const retry = useCallback(() => refresh.current?.retry(), []);
  const scope = cart.loaded ? { visitId, cartVersion: cart.version } : null;
  // Render-time gating hides old cards/details immediately, before effects cancel the old request.
  const current: RecommendationState = scope && sameRecommendationScope(state.scope, scope) ? state : { status: "loading", scope };
  return { state: current, retry, updating: cart.loaded };
}
