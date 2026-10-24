"use client";
// デモ用のログイン状態。共通の認証（@kago/backend）へ切り替えるまで使う
import { useSyncExternalStore } from "react";
import type { Session } from "./domain/types";

const KEY = "kago-ads-session-v1";
const GUEST = JSON.stringify({ role: "guest" } satisfies Session);
const listeners = new Set<() => void>();

function readRaw(): string {
  try {
    return window.localStorage.getItem(KEY) ?? GUEST;
  } catch {
    return GUEST;
  }
}

export function setSession(session: Session) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // 保存できない環境では切り替えだけ反映しない
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** 今のログイン状態。サーバー描画時と読み込み前は guest */
export function useSession(): Session {
  const raw = useSyncExternalStore(subscribe, readRaw, () => GUEST);
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return { role: "guest" };
  }
}

export function sessionKey(s: Session): string {
  switch (s.role) {
    case "guest":
      return "guest";
    case "maker_staff":
      return `maker_staff:${s.makerId}`;
    case "signage":
      return `signage:${s.deviceId}`;
    default:
      return `${s.role}:${s.storeId}`;
  }
}

export function parseSessionKey(key: string): Session {
  const [role, id] = key.split(":");
  if (role === "maker_staff" && id) return { role, makerId: id };
  if (role === "store_staff" && id) return { role, storeId: id };
  return { role: "guest" };
}
