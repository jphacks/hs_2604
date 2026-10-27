"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useShoppingSession } from "@/features/shopping/session-provider";
import { useAppEvents } from "@/features/events/event-provider";
import type { SavedSelectionItem } from "./selection-contracts";
const Context = createContext<{
  ids: string[];
  dismiss: (item: SavedSelectionItem) => void;
} | null>(null);
export function RecommendationDismissals({
  children,
}: {
  children: ReactNode;
}) {
  const session = useShoppingSession(),
    track = useAppEvents();
  const key = "kago-hidden:" + session.userId + ":" + session.visit!.id;
  const [ids, setIds] = useState<string[]>([]),
    current = useRef<string[]>([]);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const parsed: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
        if (
          Array.isArray(parsed) &&
          parsed.every((x) => typeof x === "string")
        ) {
          current.current = parsed.slice(-500);
          setIds(current.current);
        }
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, [key]);
  const dismiss = (item: SavedSelectionItem) => {
    if (current.current.includes(item.selectionItemId)) return;
    current.current = [...current.current, item.selectionItemId].slice(-500);
    setIds(current.current);
    try {
      sessionStorage.setItem(key, JSON.stringify(current.current));
    } catch {}
    track({
      event_type: "recommendation_dismissed",
      selection_item_id: item.selectionItemId,
      product_id: item.product.productId,
      payload: {},
    });
  };
  return (
    <Context.Provider value={{ ids, dismiss }}>{children}</Context.Provider>
  );
}
export const useRecommendationDismissals = () => useContext(Context);
