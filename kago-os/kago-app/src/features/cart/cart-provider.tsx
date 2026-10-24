"use client";

import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { useShoppingSession } from "@/features/shopping/session-provider";
import { cartMessages, type CartLine, type CartSnapshot, type PendingCart, type StoreProduct } from "./contracts";

type CartContextValue = {
  lines: CartLine[]; itemCount: number; subtotal: number; discountTotal: number; total: number;
  claimedOfferIds: string[]; canEdit: boolean; busy: boolean;
  version: number; message: string; error: boolean; pending: boolean;
  addProduct: (product: StoreProduct) => void; scan: (code: string) => void;
  scanFailed: (reason: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  claimOffer: (offerId: string) => void;
  retry: () => void; reload: () => void;
};
const CartContext = createContext<CartContextValue | null>(null);

export async function cartRequest(path = "/api/cart", body?: object, signal?: AbortSignal) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET", cache: "no-store", credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
  });
  const data = await response.json();
  if (!response.ok) throw { code: data.code, status: response.status };
  return data;
}

// Display only DB snapshots. Retain the pending intent per user/visit/tab across reloads.
export function CartProvider({ children }: { children: ReactNode }) {
  const session = useShoppingSession();
  const visitId = session.visit!.id;
  const storageKey = `kago-cart-pending:${session.userId}:${visitId}`;
  const [snapshot, setSnapshot] = useState<CartSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("店舗のかごを確認しています…");
  const [error, setError] = useState(false);
  const operation = useRef<PendingCart | null>(null);
  const locked = useRef(false);
  const mounted = useRef(false);
  const lifecycle = useRef<AbortController | null>(null);
  const updates = useRef<BroadcastChannel | null>(null);

  const remember = (value: PendingCart | null) => {
    // Fail before sending a new write if the browser cannot retain its retry key.
    if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
    else sessionStorage.removeItem(storageKey);
    operation.current = value;
    setPending(!!value);
  };
  const accept = (data: CartSnapshot) => {
    if (data.visit?.id !== visitId || data.visit.store_id !== session.visit!.store_id) throw { code: "visit_ended" };
    if (mounted.current) setSnapshot(data);
  };
  const explain = (failure: unknown) => {
    const code = (failure as { code?: string })?.code ?? "connection_failed";
    if (["session_expired", "unauthenticated"].includes(code)) { session.revalidate(); return; }
    setError(true);
    setMessage(cartMessages[code] ?? cartMessages.connection_failed);
  };
  const reload = async () => {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    try {
      accept(await cartRequest("/api/cart", undefined, lifecycle.current?.signal));
      if (mounted.current) {
        setError(false);
        setMessage(operation.current ? "保存結果が未確認の操作があります。同じ操作を再試行してください。" : "かごを最新の状態にしました。");
      }
    } catch (failure) { if (mounted.current) explain(failure); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  const send = async () => {
    if (locked.current || !operation.current) return;
    locked.current = true; setBusy(true); setError(false); setMessage("かごに保存しています…");
    try {
      let intent = operation.current;
      if (intent.kind === "lookup") {
        const { product } = await cartRequest("/api/cart", {
          action: "lookup", visitId, requestId: intent.requestId, code: intent.code, productId: intent.productId, failureReason: intent.failureReason,
        }, lifecycle.current?.signal);
        if (!mounted.current) return;
        intent = { kind: "set", operation: {
          visitId, requestId: intent.mutationId, expectedVersion: intent.expectedVersion,
          productId: product.productId, quantity: (intent.quantities[product.productId] ?? 0) + 1,
          source: intent.code === undefined ? "manual" : "scan",
        } };
        remember(intent);
      }
      const data = intent.kind === "claim"
        ? await cartRequest("/api/cart", { action: "claim", ...intent.claim }, lifecycle.current?.signal)
        : await cartRequest("/api/cart", { action: "set", ...intent.operation }, lifecycle.current?.signal);
      if (!mounted.current) return;
      accept(data); remember(null); setMessage("かごを保存しました。");
      updates.current?.postMessage("updated");
    } catch (failure) {
      if (!mounted.current) return;
      const code = (failure as { code?: string }).code;
      const definitive = ["scan_failed", "cart_changed", "offer_unavailable", "offer_claimed", "trigger_missing", "product_not_found", "product_unavailable", "invalid_request", "request_conflict", "visit_ended", "forbidden"].includes(code ?? "");
      if (definitive) {
        remember(null);
        try { accept(await cartRequest("/api/cart", undefined, lifecycle.current?.signal)); } catch { /* keep the explicit failure */ }
      }
      if (mounted.current) explain(failure);
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  const begin = (intent: PendingCart) => {
    if (locked.current || operation.current || !snapshot) return;
    try { remember(intent); void send(); }
    catch { setError(true); setMessage("操作を安全に保存できません。ブラウザのストレージ設定を確認してください。"); }
  };
  const lookup = (target: { code?: string; productId?: string; failureReason?: string }) => {
    if (!snapshot) return;
    begin({ kind: "lookup", visitId, requestId: crypto.randomUUID(), mutationId: crypto.randomUUID(),
      expectedVersion: snapshot.visit.cart_version,
      quantities: Object.fromEntries(snapshot.cart.map(line => [line.productId, line.quantity])), ...target });
  };
  useEffect(() => {
    mounted.current = true;
    lifecycle.current = new AbortController();
    const boot = window.setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) {
          const saved = JSON.parse(raw) as PendingCart;
          if ((saved.kind === "lookup" && saved.visitId === visitId) || (saved.kind === "set" && saved.operation.visitId === visitId)
            || (saved.kind === "claim" && saved.claim.visitId === visitId)) {
            operation.current = saved; setPending(true);
          }
        }
      } catch { /* Invalid local state never becomes a write. */ }
      void reload();
    }, 0);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("kago-cart-updated") : null;
    updates.current = channel;
    if (channel) channel.onmessage = () => { if (!operation.current) void reload(); };
    return () => { mounted.current = false; lifecycle.current?.abort(); window.clearTimeout(boot); channel?.close(); updates.current = null; };
    // The session provider unmounts this tree on identity/visit changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, visitId]);

  const lines = snapshot?.cart ?? [];
  const subtotal = lines.reduce((n, l) => n + l.quantity * l.price, 0);
  const discountTotal = snapshot?.discountTotal ?? 0;
  return <CartContext.Provider value={{ lines, itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    subtotal, discountTotal, total: subtotal - discountTotal, claimedOfferIds: snapshot?.claimedOfferIds ?? [],
    version: snapshot?.visit.cart_version ?? 0,
    canEdit: !!snapshot && !busy && !pending, busy, pending, message, error,
    addProduct: product => lookup({ productId: product.productId }), scan: code => lookup({ code }),
    scanFailed: reason => lookup({ failureReason: reason }),
    setQuantity: (productId, quantity) => {
      if (!snapshot) return;
      begin({ kind: "set", operation: { visitId, productId, quantity, requestId: crypto.randomUUID(),
        expectedVersion: snapshot.visit.cart_version, source: "manual" } });
    }, claimOffer: offerId => {
      if (!snapshot) return;
      begin({ kind: "claim", claim: { visitId, offerId, requestId: crypto.randomUUID(), expectedVersion: snapshot.visit.cart_version } });
    }, retry: () => { void send(); }, reload: () => { void reload(); },
  }}>{children}</CartContext.Provider>;
}
export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}
