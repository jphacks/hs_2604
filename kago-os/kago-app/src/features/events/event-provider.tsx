"use client";

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { useShoppingSession } from "@/features/shopping/session-provider";
import type { EventAction } from "./contracts";
import { EventOutbox } from "./outbox";

const Events = createContext<((action: EventAction) => void) | null>(null);
export function EventProvider({ children }: { children: ReactNode }) {
  const session = useShoppingSession();
  const userId = session.userId, visitId = session.visit!.id, storeId = session.visit!.store_id;
  const queue = useRef<EventOutbox | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    // Access storage through methods: even obtaining sessionStorage can throw in private mode.
    const storage = { getItem: (key: string) => sessionStorage.getItem(key), setItem: (key: string, value: string) => sessionStorage.setItem(key, value) };
    const outbox = new EventOutbox(`kago-events:${userId}`, storage, async event => {
      if (controller.signal.aborted) throw new Error("Stopped");
      const response = await fetch("/api/events", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
      });
      return response.status;
    });
    queue.current = outbox;
    const retry = () => { if (!document.hidden) void outbox.flush(); };
    retry();
    const timer = window.setInterval(retry, 10_000);
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    return () => {
      controller.abort(); queue.current = null; window.clearInterval(timer);
      window.removeEventListener("online", retry); document.removeEventListener("visibilitychange", retry);
    };
  }, [userId]);
  const track = useCallback((action: EventAction) => {
    queue.current?.enqueue({ ...action, event_id: crypto.randomUUID(), schema_version: 1, occurred_at: new Date().toISOString(),
      user_id: userId, visit_id: visitId, store_id: storeId, channel: "app", data_origin: "operated" });
    void queue.current?.flush();
  }, [userId, visitId, storeId]);
  return <Events.Provider value={track}>{children}</Events.Provider>;
}
export function useAppEvents() {
  const track = useContext(Events);
  if (!track) throw new Error("EventProvider is required");
  return track;
}
