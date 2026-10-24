"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { ShoppingContext } from "./service";

type Failure = { code: string; message: string };
type State = { kind: "loading" } | { kind: "login"; error?: string } | { kind: "error"; error: Failure } | { kind: "connected"; context: ShoppingContext };
const ShoppingSession = createContext<ShoppingContext | null>(null);
const button = "min-h-12 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50";

async function request(body?: Record<string, unknown>, signal?: AbortSignal) {
  const response = await fetch("/api/shopping", {
    method: body ? "POST" : "GET", cache: "no-store", credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
  });
  const data = await response.json();
  if (!response.ok) throw data as Failure;
  return data;
}

function safeFailure(error: unknown): Failure {
  const known = error as Partial<Failure> | null;
  const messages: Record<string, string> = {
    configuration_missing: "買い物機能の接続設定がまだありません。担当者へお問い合わせください。",
    configuration_invalid: "買い物機能の接続設定を確認する必要があります。",
    database_not_ready: "買い物機能は準備中です。店舗・来店・かごのDB設定が完了したら再試行してください。",
    forbidden: "このアカウントでは買い物を開始できません。消費者アカウントでログインしてください。",
    invalid_credentials: "メールアドレスまたはパスワードを確認してください。",
    session_expired: "認証の有効期限が切れました。もう一度ログインしてください。",
    unauthenticated: "ログインしてください。",
  };
  const code = known?.code && messages[known.code] ? known.code : "connection_failed";
  return { code, message: messages[code] ?? "接続できませんでした。通信状態を確認して再試行してください。" };
}

export function ShoppingSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [choosingStore, setChoosingStore] = useState(false);
  const serial = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);

  const transition = useCallback(async (body?: Record<string, unknown>) => {
    const current = ++serial.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    // Unmount private data before logout, switching accounts/stores or revalidation.
    setState({ kind: "loading" });
    try {
      let data = await request(body, controller.signal);
      if (body?.action === "login" || body?.action === "logout") {
        channel.current?.postMessage("identity_changed");
        if (body.action === "logout") {
          if (current === serial.current && !controller.signal.aborted) setState({ kind: "login" });
          return;
        }
        data = await request(undefined, controller.signal);
      }
      if (current !== serial.current || controller.signal.aborted) return;
      if (body?.action === "start_visit") channel.current?.postMessage("visit_changed");
      setChoosingStore(false);
      setState({ kind: "connected", context: data as ShoppingContext });
    } catch (error) {
      if (current !== serial.current || controller.signal.aborted) return;
      const failure = safeFailure(error);
      setState(["unauthenticated", "session_expired", "invalid_credentials"].includes(failure.code)
        ? { kind: "login", error: failure.code === "unauthenticated" ? undefined : failure.message }
        : { kind: "error", error: failure });
    }
  }, []);

  useEffect(() => {
    const boot = window.setTimeout(() => { void transition(); }, 0);
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("kago-shopping-session");
      channel.current.onmessage = () => { void transition(); };
    }
    const revalidate = () => { if (document.visibilityState === "visible") void transition(); };
    document.addEventListener("visibilitychange", revalidate);
    const timer = window.setInterval(revalidate, 60_000);
    return () => {
      pending.current?.abort();
      channel.current?.close();
      window.clearTimeout(boot);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [transition]);

  const login = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    event.currentTarget.reset();
    void transition({ action: "login", email: String(data.get("email") ?? ""), password });
  };
  const logout = () => { void transition({ action: "logout" }); };

  if (state.kind === "connected" && state.context.visit && !choosingStore) {
    const context = state.context;
    const store = context.stores.find(s => s.id === context.visit!.store_id)!;
    return <ShoppingSession.Provider value={context}>
      <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        <div className="mx-auto flex max-w-xl flex-wrap items-center justify-between gap-2">
          <span className="font-bold">{store.name} {store.branch_name}</span>
          <div className="flex gap-4"><button type="button" onClick={() => setChoosingStore(true)} className="min-h-10 underline">店舗・来店を選ぶ</button><button type="button" onClick={logout} className="min-h-10 underline">ログアウト</button></div>
        </div>
      </div>
      {children}
    </ShoppingSession.Provider>;
  }

  return <main className="min-h-screen bg-[#f4f7f5] px-4 py-12 text-slate-950">
    <div className="mx-auto max-w-md rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
      <p className="text-xs font-black tracking-widest text-emerald-700">KAGO/APP</p>
      {state.kind === "loading" && <p role="status" className="mt-6">ログインと買い物の状態を確認しています…</p>}
      {state.kind === "login" && <>
        <h1 className="mt-3 text-2xl font-black">買い物をはじめる</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">ログインして店舗を選ぶと、お使いのかごを開けます。</p>
        {state.error && <p role="alert" className="mt-4 text-sm text-red-700">{state.error}</p>}
        <form onSubmit={login} className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm font-bold">メールアドレス<input name="email" type="email" required maxLength={254} autoComplete="username" className="min-h-12 rounded-xl border border-slate-300 px-3" /></label>
          <label className="grid gap-2 text-sm font-bold">パスワード<input name="password" type="password" required maxLength={1024} autoComplete="current-password" className="min-h-12 rounded-xl border border-slate-300 px-3" /></label>
          <button className={button}>ログイン</button>
        </form>
      </>}
      {state.kind === "error" && <>
        <h1 className="mt-3 text-2xl font-black">買い物を開けませんでした</h1>
        <p role="alert" className="mt-4 text-sm leading-6 text-slate-600">{state.error.message}</p>
        <div className="mt-6 grid gap-3"><button type="button" onClick={() => { void transition(); }} className={button}>再試行</button><button type="button" onClick={logout} className="min-h-12 text-sm underline">ログアウトして別のアカウントを使う</button></div>
      </>}
      {state.kind === "connected" && <>
        <h1 className="mt-3 text-2xl font-black">お買い物の店舗を選ぶ</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">続きから開くと、同じ来店のかごを復元します。</p>
        <div className="mt-6 grid gap-4">
          {state.context.stores.map(store => {
            const active = state.context.activeVisits.find(v => v.store_id === store.id);
            const start = (startNew: boolean) => {
              if (startNew && active && !window.confirm("進行中の来店を終了し、空のかごで新しい買い物を始めます。よろしいですか？")) return;
              void transition({ action: "start_visit", storeId: store.id, startNew, previousVisitId: active?.id ?? null });
            };
            return <section key={store.id} className="grid gap-3 rounded-2xl border border-slate-200 p-4">
              <h2 className="font-bold">{store.name} {store.branch_name}</h2>
              {active && <p className="text-xs text-slate-500">進行中の買い物があります</p>}
              <button type="button" onClick={() => start(false)} className={button}>{active ? "続きから開く" : "この店舗で買い物を始める"}</button>
              {active && <button type="button" onClick={() => start(true)} className="min-h-11 text-sm underline">空のかごで新しく来店する</button>}
            </section>;
          })}
          {state.context.stores.length === 0 && <p role="status" className="text-sm">利用できる店舗がありません。店舗の登録をお待ちください。</p>}
        </div>
        <button type="button" onClick={logout} className="mt-6 min-h-11 text-sm underline">ログアウト</button>
      </>}
    </div>
  </main>;
}

export function useShoppingSession() {
  const value = useContext(ShoppingSession);
  if (!value) throw new Error("Shopping session is required");
  return value;
}
