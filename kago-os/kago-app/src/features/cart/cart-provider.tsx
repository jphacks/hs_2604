"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { Product } from "@/lib/products";
import { useShoppingSession } from "@/features/shopping/session-provider";

export type CartLine = Product & { quantity: number };
type Cart = Record<string, CartLine>;
type CartContextValue = {
  cart: Cart;
  lines: CartLine[];
  itemCount: number;
  total: number;
  canEdit: boolean;
  addToCart: (product: Product, quantity?: number) => void;
  addItems: (items: Array<{ product: Product; quantity: number }>) => void;
  changeQuantity: (code: string, amount: number) => void;
  clearCart: () => void;
};
const CartContext = createContext<CartContextValue | null>(null);

// The verified server snapshot is authoritative. Never restore the old shared
// kago-os-cart localStorage into a signed-in user's visit. DB mutations are APP-02.
export function CartProvider({ children }: { children: ReactNode }) {
  const session = useShoppingSession();
  const value = useMemo<CartContextValue>(() => {
    const lines = session.cart;
    return {
      lines,
      cart: Object.fromEntries(lines.map(line => [line.code, line])),
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      total: lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
      canEdit: false,
      addToCart: () => {},
      addItems: () => {},
      changeQuantity: () => {},
      clearCart: () => {},
    };
  }, [session]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}
