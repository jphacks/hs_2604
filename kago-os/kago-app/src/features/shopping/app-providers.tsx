"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ShoppingSessionProvider } from "./session-provider";
import { StoreProvider } from "../store/store-provider";
import { CartProvider } from "../cart/cart-provider";
import { RecommendationDismissals } from "../recommendations/dismissals";
import { EventProvider } from "../events/event-provider";

export function AppProviders({children}:{children:ReactNode}) {
  // Checkout owns its auth; printed reference barcodes need no shopping session.
  const pathname = usePathname();
  if(pathname==="/App/checkout" || pathname==="/App/demo-barcodes" || pathname==="/App/demo-offers") return children;
  return <ShoppingSessionProvider><StoreProvider><EventProvider><RecommendationDismissals><CartProvider>{children}</CartProvider></RecommendationDismissals></EventProvider></StoreProvider></ShoppingSessionProvider>;
}
