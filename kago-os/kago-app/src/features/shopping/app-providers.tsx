"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ShoppingSessionProvider } from "./session-provider";
import { StoreProvider } from "../store/store-provider";
import { CartProvider } from "../cart/cart-provider";
import { EventProvider } from "../events/event-provider";

export function AppProviders({children}:{children:ReactNode}) {
  // Checkout owns its auth; printed reference barcodes need no shopping session.
  const pathname = usePathname();
  if(pathname==="/App/checkout" || pathname==="/App/demo-barcodes") return children;
  return <ShoppingSessionProvider><StoreProvider><EventProvider><CartProvider>{children}</CartProvider></EventProvider></StoreProvider></ShoppingSessionProvider>;
}
