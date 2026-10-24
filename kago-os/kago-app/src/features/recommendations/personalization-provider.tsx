"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type PersonalizationSettings = {
  usePurchaseHistory: boolean;
  useCurrentCart: boolean;
  recommendationNotifications: boolean;
};

type PersonalizationContextValue = {
  settings: PersonalizationSettings;
  updateSetting: <Key extends keyof PersonalizationSettings>(
    key: Key,
    value: PersonalizationSettings[Key],
  ) => void;
};

const STORAGE_KEY = "kago-os-personalization";
const DEFAULT_SETTINGS: PersonalizationSettings = {
  usePurchaseHistory: true,
  useCurrentCart: true,
  recommendationNotifications: false,
};

const PersonalizationContext = createContext<PersonalizationContextValue | null>(null);

export function PersonalizationProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    let restoredSettings = DEFAULT_SETTINGS;
    try {
      const savedSettings = window.localStorage.getItem(STORAGE_KEY);
      if (savedSettings) {
        restoredSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) };
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    const restoreTimer = window.setTimeout(() => {
      setSettings(restoredSettings);
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings, storageReady]);

  const value = useMemo<PersonalizationContextValue>(() => ({
    settings,
    updateSetting: (key, value) => {
      setSettings((current) => ({ ...current, [key]: value }));
    },
  }), [settings]);

  return (
    <PersonalizationContext.Provider value={value}>
      {children}
    </PersonalizationContext.Provider>
  );
}

export function usePersonalization() {
  const context = useContext(PersonalizationContext);
  if (!context) {
    throw new Error("usePersonalization must be used within PersonalizationProvider");
  }
  return context;
}
