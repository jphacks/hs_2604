"use client";

import { SessionScreen } from "./session-screen";
import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { StoreEntry } from "./store-entry";
import { parseStoreQr } from "./store-qr";
import type { ShoppingContext } from "./service";

type Failure = { code: string; message: string };
type State = { kind: "loading" } | { kind: "login"; error?: string } | { kind: "error"; error: Failure } | { kind: "connected"; context: ShoppingContext };
const ShoppingSession = createContext<(ShoppingContext & { revalidate: () => void; chooseStore:()=>void; logout:()=>void }) | null>(null);

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
    // On the login screen nothing is shown to refresh: do not reload it (that would clear what is being typed).
    // A login in another tab still arrives through the BroadcastChannel ("identity_changed").
    if (shown.current.kind === "login") return;
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
    return <ShoppingSession.Provider value={{ ...context, revalidate: () => { void check(); }, chooseStore:()=>setChoosingStore(true), logout }}>
      <div className="shopping-session-bar border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
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

  if(state.kind==="connected"){
    return <StoreEntry context={state.context} qrStore={qrStore} error={qrError|| (qrStore&&!state.context.stores.some(store=>store.id===qrStore)?"QRの店舗は現在利用できません。別のQRを読み取るか、店舗を選択してください。":"")}
      onDetected={value=>{
        const id=parseStoreQr(value,window.location.origin);
        if(!id||!state.context.stores.some(store=>store.id===id)){setQrError("利用できる店舗のQRコードではありません。店頭のQRを読み直してください。");return;}
        setQrStore(id);setQrError("");
        const url=new URL(window.location.href);url.searchParams.set("store",id);window.history.replaceState(null,"",url);
      }}
      onClearQr={()=>{setQrStore(null);setQrError("");const url=new URL(window.location.href);url.searchParams.delete("store");window.history.replaceState(null,"",url);}}
      onStart={(storeId,startNew,previousVisitId)=>{void transition({action:"start_visit",storeId,startNew,previousVisitId});}}
      onLogout={logout}/>;
  }

  return <SessionScreen kind={state.kind} error={state.kind==="error"?state.error.message:state.kind==="login"?state.error:undefined}
    onLogin={login} onRetry={()=>{void transition();}} onLogout={logout}/>;

}

export function useShoppingSession() {
  const value = useContext(ShoppingSession);
  if (!value) throw new Error("Shopping session is required");
  return value;
}
