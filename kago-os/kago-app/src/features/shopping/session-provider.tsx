"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { BarcodeScanner } from "@/features/scanner/barcode-scanner";
import { parseStoreQr } from "./store-qr";
import type { ShoppingContext } from "./service";

type Failure = { code: string; message: string };
type State = { kind: "loading" } | { kind: "login"; error?: string } | { kind: "error"; error: Failure } | { kind: "connected"; context: ShoppingContext };
const ShoppingSession = createContext<(ShoppingContext & { revalidate: () => void }) | null>(null);
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
  const [qrStore, setQrStore] = useState<string | null>(null);
  const [qrError, setQrError] = useState("");
  const serial = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const shown = useRef<State>(state);
  const checking = useRef(false);
  useEffect(() => { shown.current = state; }, [state]);

  // Explicit actions (first load, login, logout, choosing a store/visit) unmount private data first.
  const transition = useCallback(async (body?: Record<string, unknown>) => {
    const current = ++serial.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    // Unmount private data before logout, switching accounts or stores.
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
      if (body?.action === "start_visit" || body?.action === "demo_select") channel.current?.postMessage("visit_changed");
      if (body?.action === "start_visit") {
        setQrStore(null);
        setQrError("");
        const url = new URL(window.location.href);
        url.searchParams.delete("store");
        window.history.replaceState(null, "", url);
        setChoosingStore(false);
      }
      setState({ kind: "connected", context: data as ShoppingContext });
    } catch (error) {
      if (current !== serial.current || controller.signal.aborted) return;
      const failure = safeFailure(error);
      setState(["unauthenticated", "session_expired", "invalid_credentials"].includes(failure.code)
        ? { kind: "login", error: failure.code === "unauthenticated" ? undefined : failure.message }
        : { kind: "error", error: failure });
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }, []);

  // Periodic / on-focus / on-demand checks keep the current screen and work while they run.
  // The children are keyed by user and visit, so they unmount only if the identity or visit changed.
  const check = useCallback(async () => {
    if (checking.current || pending.current) return;
    if (shown.current.kind !== "connected") { void transition(); return; }
    checking.current = true;
    const current = serial.current;
    try {
      const data = await request();
      if (current !== serial.current || pending.current) return;
      setState({ kind: "connected", context: data as ShoppingContext });
    } catch (error) {
      if (current !== serial.current || pending.current) return;
      const failure = safeFailure(error);
      // Signed out or expired: hide private data at once. A network hiccup keeps the screen; the next check retries.
      if (["unauthenticated", "session_expired"].includes(failure.code)) {
        setState({ kind: "login", error: failure.code === "unauthenticated" ? undefined : failure.message });
      }
    } finally { checking.current = false; }
  }, [transition]);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      const url = new URL(window.location.href);
      if (url.searchParams.has("store")) {
        const storeId = parseStoreQr(url.href, url.origin);
        setQrStore(storeId);
        setQrError(storeId ? "" : "店舗のQRコードが無効です。店頭のQRを読み直すか、デモ用の店舗選択をご利用ください。");
        setChoosingStore(true);
      }
      void transition();
    }, 0);
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("kago-shopping-session");
      // Another tab signed in/out: hide private data at once (a pending background check is discarded).
      // Another tab changed the visit: check in the background.
      channel.current.onmessage = event => { if (event.data === "identity_changed") void transition(); else void check(); };
    }
    const revalidate = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", revalidate);
    const timer = window.setInterval(revalidate, 60_000);
    return () => {
      pending.current?.abort();
      channel.current?.close();
      window.clearTimeout(boot);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [transition, check]);

  const login = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    event.currentTarget.reset();
    void transition({ action: "login", email: String(data.get("email") ?? ""), password });
  };
  const logout = () => { void transition({ action: "logout" }); };

  if (state.kind === "connected" && state.context.visit && (state.context.demo || !choosingStore)) {
    const context = state.context;
    const store = context.stores.find(s => s.id === context.visit!.store_id)!;
    return <ShoppingSession.Provider value={{ ...context, revalidate: () => { void check(); } }}>
      <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        <div className="mx-auto flex max-w-xl flex-wrap items-center justify-between gap-2">
          <span className="font-bold">{store.name} {store.branch_name}</span>
          {context.demo ? <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-3 py-2 text-xs font-bold">デモ用アカウントで表示中</span>
            <label className="flex items-center gap-2 text-xs font-bold">利用者
              <select aria-label="デモ利用者を切り替える" value={context.demo.user} onChange={event => { void transition({ action: "demo_select", user: event.target.value }); }} className="min-h-11 rounded-xl border border-emerald-200 bg-white px-3 text-sm">
                {context.demo.users.map(user => <option key={user.id} value={user.id}>{user.id} {user.label}</option>)}
              </select>
            </label>
          </div> : <div className="flex gap-4"><button type="button" onClick={() => setChoosingStore(true)} className="min-h-10 underline">店舗・来店を選ぶ</button><button type="button" onClick={logout} className="min-h-10 underline">ログアウト</button></div>}
        </div>
      </div>
      <Fragment key={`${context.userId}:${context.visit!.id}`}>{children}</Fragment>
    </ShoppingSession.Provider>;
  }

  return <main className="min-h-screen bg-[#f4f7f5] px-4 py-12 text-slate-950">
    <div className="mx-auto max-w-md rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
      <p className="text-xs font-black tracking-widest text-emerald-700">KAGO/APP</p>
      {state.kind === "loading" && <p role="status" className="mt-6">ログインと買い物の状態を確認しています…</p>}
      {state.kind === "login" && <>
        <h1 className="mt-3 text-2xl font-black">買い物をはじめる</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">ログイン後、店舗のQRコードを読み取るか、デモ用の店舗選択から買い物を開始できます。</p>
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
          <BarcodeScanner purpose="store" onDetected={(value) => {
            const id = parseStoreQr(value, window.location.origin);
            if (!id || !state.context.stores.some(store => store.id === id)) {
              setQrError("利用できる店舗のQRコードではありません。店頭のQRを読み直してください。");
              return;
            }
            setQrStore(id);
            setQrError("");
            const url = new URL(window.location.href);
            url.searchParams.set("store", id);
            window.history.replaceState(null, "", url);
          }} />
          <p className="text-xs leading-5 text-slate-500">カメラを利用できない場合は、スマートフォンのカメラでQRを開くか、下のデモ用店舗選択をご利用ください。</p>
          {qrError && <p role="alert" className="text-sm text-red-700">{qrError}</p>}
          {qrStore && !state.context.stores.some(store => store.id === qrStore) && <p role="alert" className="text-sm text-red-700">QRの店舗は現在利用できません。別のQRを読み取るか、デモ用の店舗選択をご利用ください。</p>}
          {qrStore && state.context.stores.some(store => store.id === qrStore) && <p role="status" className="font-bold text-emerald-800">QRの店舗を確認しました。下のボタンで買い物を開始してください。</p>}
          {qrStore && <button type="button" onClick={() => {
            setQrStore(null); setQrError("");
            const url = new URL(window.location.href);
            url.searchParams.delete("store");
            window.history.replaceState(null, "", url);
          }} className="min-h-11 text-sm underline">デモ用の店舗選択に戻る</button>}
          {!qrStore && <h2 className="font-bold">店舗を選んで来店する（デモ用・一時対応）</h2>}
          {state.context.stores.filter(store => !qrStore || store.id === qrStore).map(store => {
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
