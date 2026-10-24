"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useShoppingSession } from "../shopping/session-provider";
import { accountRequest, accountFailureMessage, isAccountAuthFailure } from "../account/client";
import type { PersonalizationSettings, SettingKey, SettingsResponse } from "../account/contracts";

type Intent = { key: SettingKey; value: boolean; expectedUpdatedAt: string | null };
type Context = { settings: PersonalizationSettings | null; busy: boolean; pending: boolean; message: string; error: boolean;
  updateSetting: (key: SettingKey, value: boolean) => void; reload: () => void; retry: () => void };
const PersonalizationContext = createContext<Context | null>(null);

// Consent belongs to the authenticated DB user. Never restore the demo localStorage key.
export function PersonalizationProvider({ children }: { children: ReactNode }) {
  const session = useShoppingSession();
  const [settings, setSettings] = useState<PersonalizationSettings | null>(null);
  const [busy, setBusy] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const intent = useRef<Intent | null>(null);
  const locked = useRef(false);
  const alive = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);

  const accept = (data: SettingsResponse) => {
    if (data.scope.userId !== session.userId || data.scope.visitId !== session.visit!.id) throw { code: "visit_unavailable" };
    if (alive.current) setSettings(data.settings);
  };
  const explain = (failure: unknown, saving = false) => {
    if (isAccountAuthFailure(failure)) { session.revalidate(); return; }
    setError(true);
    setMessage(saving && !(failure as { code?: string }).code
      ? "保存結果を確認できません。同じ設定を再試行するか、DBの設定を再読み込みしてください。" : accountFailureMessage(failure));
  };
  const reload = async () => {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    try {
      const data = await accountRequest("/api/account", undefined, controller.current?.signal);
      if (!alive.current) return;
      accept(data); intent.current = null; setPending(false); setError(false); setMessage("");
    } catch (failure) { if (alive.current) explain(failure); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  };
  const save = async () => {
    if (locked.current || !intent.current) return;
    locked.current = true; setBusy(true); setError(false); setMessage("設定を保存しています…");
    try {
      const data = await accountRequest("/api/account", { visitId: session.visit!.id, ...intent.current }, controller.current?.signal);
      if (!alive.current) return;
      accept(data); intent.current = null; setPending(false); setMessage("設定を保存しました。");
      channel.current?.postMessage("settings_changed");
    } catch (failure) {
      if (!alive.current) return;
      const code = (failure as { code?: string }).code;
      if (["settings_changed", "invalid_request"].includes(code ?? "")) {
        intent.current = null; setPending(false);
        try { accept(await accountRequest("/api/account", undefined, controller.current?.signal)); } catch { /* keep the conflict message */ }
      }
      if (alive.current) explain(failure, true);
    } finally { locked.current = false; if (alive.current) setBusy(false); }
  };
  useEffect(() => {
    alive.current = true; controller.current = new AbortController();
    const boot = window.setTimeout(() => { void reload(); }, 0);
    channel.current = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("kago-account-settings") : null;
    if (channel.current) channel.current.onmessage = () => { if (!intent.current) void reload(); };
    return () => { alive.current = false; controller.current?.abort(); channel.current?.close(); window.clearTimeout(boot); };
    // Identity/visit changes unmount the App's private tree.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <PersonalizationContext.Provider value={{ settings, busy, pending, message, error,
    updateSetting: (key, value) => {
      if (!settings || locked.current || intent.current) return;
      intent.current = { key, value, expectedUpdatedAt: settings.updatedAt }; setPending(true); void save();
    }, reload: () => { void reload(); }, retry: () => { void save(); },
  }}>{children}</PersonalizationContext.Provider>;
}
export function usePersonalization() {
  const value = useContext(PersonalizationContext);
  if (!value) throw new Error("Personalization provider is required");
  return value;
}
