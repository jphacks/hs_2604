"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

import { DEMO_PRODUCT_LIST, Product } from "@/lib/products";

export type StoreProfile = {
  name: string;
  branchName: string;
  storeCode: string;
  industry: string;
  address: string;
  businessHours: string;
};

type StoreContextValue = {
  profile: StoreProfile | null;
  products: Product[];
  saveProfile: (profile: StoreProfile) => void;
  replaceProducts: (products: Product[]) => void;
  addProduct: (product: Product) => void;
  removeProduct: (code: string) => void;
};

const PROFILE_STORAGE_KEY = "kago-os-store-profile";
const PRODUCTS_STORAGE_KEY = "kago-os-store-products";
const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<StoreProfile | null>(null);
  const [products, setProducts] = useState<Product[]>(DEMO_PRODUCT_LIST);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    let restoredProfile: StoreProfile | null = null;
    let restoredProducts = DEMO_PRODUCT_LIST;
    try {
      const savedProfile = window.localStorage.getItem(PROFILE_STORAGE_KEY);
      const savedProducts = window.localStorage.getItem(PRODUCTS_STORAGE_KEY);
      if (savedProfile) restoredProfile = JSON.parse(savedProfile) as StoreProfile;
      if (savedProducts) restoredProducts = JSON.parse(savedProducts) as Product[];
    } catch {
      window.localStorage.removeItem(PROFILE_STORAGE_KEY);
      window.localStorage.removeItem(PRODUCTS_STORAGE_KEY);
    }
    const restoreTimer = window.setTimeout(() => {
      setProfile(restoredProfile);
      setProducts(restoredProducts);
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    if (profile) {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    }
    window.localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(products));
  }, [products, profile, storageReady]);

  const value = useMemo<StoreContextValue>(() => ({
    profile,
    products,
    saveProfile: setProfile,
    replaceProducts: setProducts,
    addProduct: (product) => {
      setProducts((current) => {
        const withoutDuplicate = current.filter((item) => item.code !== product.code);
        return [product, ...withoutDuplicate];
      });
    },
    removeProduct: (code) => {
      setProducts((current) => current.filter((product) => product.code !== code));
    },
  }), [products, profile]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used within StoreProvider");
  return context;
}
