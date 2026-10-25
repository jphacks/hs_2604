"use client";
import Link from "next/link";
import {AdsTopbar} from "@/features/shell/ads-navigation";
import {AdsHomeView} from "@/features/shell/ads-home";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { BackendError, signInBackend, signOutBackend, toBackendError } from "@kago/backend";
import { Button, ButtonLink, Card, ErrorList, Field, inputClass, Loading, PageTitle } from "@/components/parts";
import { adsDataSource, createAdsBackend } from "@/lib/backend/config";
import { createSupabasePortalRepository, type PortalClient, type PortalRepository } from "@/lib/backend/portal";
import { getRepository } from "@/lib/data";
import { useSession } from "@/lib/session";
import type { Session } from "@/lib/domain/types";
import { getAdsIdentity, type AdsIdentity, type AdsRole } from "@/lib/backend/ads-identity";
import { createSupabaseStoreCallsRepository, type StoreCallsRepository } from "@/lib/backend/store-calls";
import { createSupabaseMakerRepository, type MakerRepository } from "@/lib/backend/maker";
import { storeLabel } from "@/lib/domain/rules";

type State = { status: "loading" } | { status: "guest"; error?: string }
  | { status: "ready"; identity: AdsIdentity };
type Runtime = {
  source: "mock" | "supabase"; state: State; client: PortalClient | null;
  login(email: string, password: string, role?: AdsRole): Promise<void>; logout(): Promise<void>;
  storeId: string | null; selectStore(id: string): void;
};
const Context = createContext<Runtime | null>(null);

export function AdsRuntime({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [connection] = useState(() => {
    try { return { client: adsDataSource() === "mock" ? null : createAdsBackend(), error: undefined }; }
    catch (error) { return { client: null, error: toBackendError(error).message }; }
  });
  const client = connection.client;
  const [state, setState] = useState<State>(() => connection.error
    ? { status: "guest", error: connection.error } : { status: "loading" });
  const version = useRef(0);
  const preferredRole = useRef<AdsRole | undefined>(pathname.startsWith("/ads/store") ? "store_staff" : undefined);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  // 不正なmode指定も設定エラーとして扱い、仮データには戻らない。
  let source: "mock" | "supabase" = "supabase";
  try { source = adsDataSource(); } catch { /* 設定エラーは初期状態に反映済み */ }

  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (adsDataSource() === "mock") return;
      const backend = client;
      if (!backend) return;
      const refresh = async () => {
        const current = ++version.current;
        setState({ status: "loading" });
        try {
          const identity = await getAdsIdentity(backend, preferredRole.current);
          if (active && current === version.current) setState({ status: "ready", identity });
        } catch (error) {
          if (!active || current !== version.current) return;
          const safe = toBackendError(error);
          setState({ status: "guest", error: safe.code === "unauthenticated" ? undefined : safe.message });
        }
      };
      const { data } = backend.auth.onAuthStateChange((event) => {
        ++version.current;
        if (event === "SIGNED_OUT") {
          clearTimeout(timer);
          preferredRole.current = undefined;
          setSelectedStoreId(null);
          setState({ status: "guest" });
        } else {
          // SDKの認証ロック内でgetUserやDB要求を待たない。
          setState({ status: "loading" });
          clearTimeout(timer);
          timer = setTimeout(() => { if (active) void refresh(); }, 0);
        }
      });
      const onFocus = () => { void refresh(); };
      window.addEventListener("focus", onFocus);
      cleanup = () => { data.subscription.unsubscribe(); window.removeEventListener("focus", onFocus); };
      timer = setTimeout(() => { if (active) void refresh(); }, 0);
    } catch { /* 設定エラーは初期状態に反映済み */ }
    return () => { active = false; clearTimeout(timer); cleanup?.(); };
  }, [client]);

  async function login(email: string, password: string, role: AdsRole = "maker_staff") {
    if (!client) throw new BackendError("configuration_missing");
    setState({ status: "loading" });
    try {
      preferredRole.current = role;
      await signInBackend(client, email, password, role);
      const identity = await getAdsIdentity(client, role);
      ++version.current;
      setState({ status: "ready", identity });
    } catch (error) {
      await signOutBackend(client).catch(() => undefined);
      ++version.current;
      setState({ status: "guest", error: toBackendError(error).message });
    }
  }
  async function logout() {
    preferredRole.current = undefined;
    setSelectedStoreId(null);
    ++version.current;
    setState({ status: "guest" });
    if (!client) return;
    try { await signOutBackend(client); }
    catch (error) { setState({ status: "guest", error: toBackendError(error).message }); }
  }
  const storeId = state.status === "ready" && state.identity.role === "store_staff"
    ? (selectedStoreId && state.identity.storeIds.includes(selectedStoreId) ? selectedStoreId : state.identity.stores[0]?.id ?? null) : null;
  function selectStore(id: string) {
    if (state.status === "ready" && state.identity.role === "store_staff" && state.identity.storeIds.includes(id)) setSelectedStoreId(id);
  }
  return <Context.Provider value={{ source, state, client, login, logout, storeId, selectStore }}>{children}</Context.Provider>;
}

export function useAdsRuntime() {
  const value = useContext(Context);
  if (!value) throw new Error("Adsの接続コンテキストがありません。");
  return value;
}

export function usePortalSession(): Session {
  const demo = useSession();
  const { source, state } = useAdsRuntime();
  if (source === "mock") return demo;
  return state.status === "ready" && state.identity.role === "maker_staff" ? { role: "maker_staff", makerId: state.identity.makerIds[0] } : { role: "guest" };
}

export function usePortalRepository(): () => PortalRepository {
  const { source, state, client } = useAdsRuntime();
  return () => {
    if (source === "mock") return getRepository();
    if (!client || state.status !== "ready") throw new BackendError("unauthenticated");
    return createSupabasePortalRepository(client);
  };
}

export function useMakerRepository(): () => MakerRepository {
  const { source, state, client } = useAdsRuntime();
  return () => {
    if (source === "mock") return getRepository();
    if (!client || state.status !== "ready" || state.identity.role !== "maker_staff") throw new BackendError("forbidden");
    return createSupabaseMakerRepository(client);
  };
}

export function useStoreSession(): Session {
  const demo = useSession();
  const { source, state, storeId } = useAdsRuntime();
  if (source === "mock") return demo;
  return state.status === "ready" && state.identity.role === "store_staff" && storeId
    ? { role: "store_staff", storeId } : { role: "guest" };
}

export function useStoreCallsRepository(): () => StoreCallsRepository {
  const { source, state, client } = useAdsRuntime();
  return () => {
    if (source === "mock") return getRepository();
    if (!client || state.status !== "ready" || state.identity.role !== "store_staff") throw new BackendError("forbidden");
    return createSupabaseStoreCallsRepository(client);
  };
}

function Login() {
  const { state, client, login } = useAdsRuntime();
  const pathname = usePathname();
  const [role, setRole] = useState<AdsRole>(pathname.startsWith("/ads/store") ? "store_staff" : "maker_staff");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try { await login(email, password, role); }
    finally { setPassword(""); setBusy(false); }
  }
  return <div className="ads-login mx-auto max-w-md">
    <PageTitle title={role === "store_staff" ? "店舗担当者としてログイン" : "メーカーとしてログイン"} lead="メーカーは募集を探せます。店舗担当者は自店の募集を作成・公開できます。" />
    <Card>
      {state.status === "guest" && state.error && <ErrorList errors={[state.error]} />}
      <form className="mt-4 space-y-4" onSubmit={submit}>
        <fieldset className="flex gap-4 text-sm"><legend className="mb-2 font-semibold">利用する役割</legend>
          <label className="flex gap-2"><input type="radio" name="ads-role" checked={role === "maker_staff"} onChange={() => setRole("maker_staff")} />メーカー</label>
          <label className="flex gap-2"><input type="radio" name="ads-role" checked={role === "store_staff"} onChange={() => setRole("store_staff")} />店舗担当者</label>
        </fieldset>
        <Field label="メールアドレス"><input className={inputClass} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="パスワード"><input className={inputClass} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Button type="submit" disabled={!client || busy}>{busy ? "ログイン中…" : "ログイン"}</Button>
      </form>
      <p className="mt-4 text-xs text-muted">アカウントの役割と所属に応じて利用できます。アカウントと所属は担当者が設定します。</p>
    </Card>
  </div>;
}

export function AdsAccess({ children }: { children: ReactNode }) {
  const { source, state, storeId } = useAdsRuntime();
  const pathname = usePathname();
  if (source === "mock") return children;
  if (state.status === "loading") return <Loading />;
  if (state.status !== "ready") return <Login />;
  const store = state.identity.role === "store_staff";
  if (pathname === "/ads") return <AdsHomeView role={state.identity.role}/>;
  if (pathname === "/ads/portal" || pathname.startsWith("/ads/portal/")) {
    if (store) return <Card><p>募集ポータルはメーカー向けです。自店の募集は「自店の募集」で確認できます。</p><ButtonLink href="/ads/store/calls">自店の募集を見る</ButtonLink></Card>;
    return <div key={state.identity.userId}>{children}</div>;
  }
  if (["/ads/store/calls", "/ads/store/calls/new", "/ads/store/calls/edit"].includes(pathname)) {
    if (!store) return <Card><p>この画面は店舗担当者向けです。店舗担当者のアカウントでログインし直してください。</p><ButtonLink href="/ads/portal">募集一覧へ戻る</ButtonLink></Card>;
    return <div key={state.identity.userId + ":" + storeId}>{children}</div>;
  }
  if (["/ads/maker/creatives", "/ads/maker/creatives/new", "/ads/maker/creative", "/ads/maker/applications", "/ads/maker/applications/new", "/ads/maker/application"].includes(pathname)) {
    if (state.identity.role !== "maker_staff") return <Card><p>メーカーとしてログインしてください。</p><ButtonLink href="/ads/store/calls">自店の募集へ戻る</ButtonLink></Card>;
    return <div key={state.identity.userId + ":" + state.identity.makerIds[0]}>{children}</div>;
  }
  if (pathname === "/ads/maker/results") {
    if (store) return <Card><p>成果画面はメーカー向けです。</p><ButtonLink href="/ads/store/calls">自店の募集へ戻る</ButtonLink></Card>;
    return <div key={state.identity.userId}>{children}</div>;
  }
  return <Card>
    <h1 className="text-xl font-bold">この操作はDB接続の準備中です</h1>
    <p className="mt-3 text-sm text-muted">審査（承認・却下）はKAGO/Insightで行います。この画面では保存は行いません。</p>
    <Link className="mt-4 inline-block text-brand underline" href={store ? "/ads/store/calls" : "/ads/portal"}>募集一覧へ戻る</Link>
  </Card>;
}

export function ConnectedAdsHeader() {
  const { state, logout, storeId, selectStore } = useAdsRuntime();
  const identity = state.status === "ready" ? state.identity : null;
  const store = identity?.role === "store_staff" ? identity : null;
  const nav=store?[{href:"/ads/store/calls",label:"自店の募集"}]:[
    {href:"/ads/portal",label:"募集を探す"},{href:"/ads/portal/stores",label:"店舗一覧"},
    ...(identity?[{href:"/ads/maker/creatives",label:"広告素材"},{href:"/ads/maker/applications",label:"申請一覧"},{href:"/ads/maker/results",label:"広告の成果"}]:[])
  ];
  return <AdsTopbar nav={nav} account={identity?(store?"店舗担当者":"メーカー"):"募集ポータル"}>
    {store && <label>操作する店舗
      <select aria-label="操作する店舗" value={storeId??""} onChange={e=>selectStore(e.target.value)}>
        {store.stores.map(s=><option key={s.id} value={s.id}>{storeLabel(s)}</option>)}
      </select>
    </label>}
    {identity && <Button variant="secondary" onClick={()=>{void logout();}}>ログアウト</Button>}
  </AdsTopbar>;
}

export function AdsFooter() {
  const { source } = useAdsRuntime();
  return <footer className="ads-footer">
    {source === "mock"
      ? "仮データで動いています。店舗・メーカー・商品はデモ用の架空のものです。"
      : "募集・広告素材・申請は共有DBへ保存します。掲載には店舗の承認が必要です。"}
  </footer>;
}
