"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

import { Product } from "@/lib/products";

export type CartLine = Product & { quantity: number };
type Cart = Record<string, CartLine>;

type CartContextValue = {
  cart: Cart;
  lines: CartLine[];
  itemCount: number;
  total: number;
  addToCart: (product: Product, quantity?: number) => void;
  addItems: (items: Array<{ product: Product; quantity: number }>) => void;
  changeQuantity: (code: string, amount: number) => void;
  clearCart: () => void;
};

const STORAGE_KEY = "kago-os-cart";
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>({});
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    let restoredCart: Cart = {};
    try {
      const savedCart = window.localStorage.getItem(STORAGE_KEY);
      if (savedCart) restoredCart = JSON.parse(savedCart) as Cart;
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    const restoreTimer = window.setTimeout(() => {
      setCart(restoredCart);
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart, storageReady]);

  const value = useMemo<CartContextValue>(() => {
    const lines = Object.values(cart);
    return {
      cart,
      lines,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      total: lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
      addToCart: (product, quantity = 1) => {
        setCart((current) => ({
          ...current,
          [product.code]: {
            ...product,
            quantity: (current[product.code]?.quantity ?? 0) + quantity,
          },
        }));
      },
      addItems: (items) => {
        setCart((current) => {
          const next = { ...current };
          for (const { product, quantity } of items) {
            next[product.code] = {
              ...product,
              quantity: (next[product.code]?.quantity ?? 0) + quantity,
            };
          }
          return next;
        });
      },
      changeQuantity: (code, amount) => {
        setCart((current) => {
          const line = current[code];
          if (!line) return current;
          const nextQuantity = line.quantity + amount;
          if (nextQuantity <= 0) {
            const next = { ...current };
            delete next[code];
            return next;
          }
          return { ...current, [code]: { ...line, quantity: nextQuantity } };
        });
      },
      clearCart: () => setCart({}),
    };
  }, [cart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}
