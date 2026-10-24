"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ShoppingSessionProvider } from "./session-provider";
import { StoreProvider } from "../store/store-provider";
import { CartProvider } from "../cart/cart-provider";
import { EventProvider } from "../events/event-provider";

export function AppProviders({children}:{children:ReactNode}) {
  // Checkout authenticates via its own API and must remain reachable after the visit is completed.
  if(usePathname()==="/App/checkout") return children;
  return <ShoppingSessionProvider><StoreProvider><EventProvider><CartProvider>{children}</CartProvider></EventProvider></StoreProvider></ShoppingSessionProvider>;
}
