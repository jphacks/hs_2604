"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { BackendError, signInBackend, signOutBackend, toBackendError } from "@kago/backend";
import { Button, ButtonLink, Card, ErrorList, Field, inputClass, Loading, PageTitle } from "@/components/parts";
import { adsDataSource, createAdsBackend } from "@/lib/backend/config";
import { createSupabasePortalRepository, requireMaker, type MakerIdentity, type PortalClient, type PortalRepository } from "@/lib/backend/portal";
import { getRepository } from "@/lib/data";
import { useSession } from "@/lib/session";
import type { Session } from "@/lib/domain/types";

type State = { status: "loading" } | { status: "guest"; error?: string }
  | { status: "ready"; identity: MakerIdentity };
type Runtime = {
  source: "mock" | "supabase"; state: State; client: PortalClient | null;
  login(email: string, password: string): Promise<void>; logout(): Promise<void>;
};
const Context = createContext<Runtime | null>(null);

export function AdsRuntime({ children }: { children: ReactNode }) {
  const [connection] = useState(() => {
    try { return { client: adsDataSource() === "mock" ? null : createAdsBackend(), error: undefined }; }
    catch (error) { return { client: null, error: toBackendError(error).message }; }
  });
  const client = connection.client;
  const [state, setState] = useState<State>(() => connection.error
    ? { status: "guest", error: connection.error } : { status: "loading" });
  const version = useRef(0);
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
          const identity = await requireMaker(backend);
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

  async function login(email: string, password: string) {
    if (!client) throw new BackendError("configuration_missing");
    setState({ status: "loading" });
    try {
      await signInBackend(client, email, password, "maker_staff");
      const identity = await requireMaker(client);
      ++version.current;
      setState({ status: "ready", identity });
    } catch (error) {
      await signOutBackend(client).catch(() => undefined);
      ++version.current;
      setState({ status: "guest", error: toBackendError(error).message });
    }
  }
  async function logout() {
    ++version.current;
    setState({ status: "guest" });
    if (!client) return;
    try { await signOutBackend(client); }
    catch (error) { setState({ status: "guest", error: toBackendError(error).message }); }
  }
  return <Context.Provider value={{ source, state, client, login, logout }}>{children}</Context.Provider>;
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
  return state.status === "ready" ? { role: "maker_staff", makerId: state.identity.makerIds[0] } : { role: "guest" };
}

export function usePortalRepository(): () => PortalRepository {
  const { source, state, client } = useAdsRuntime();
  return () => {
    if (source === "mock") return getRepository();
    if (!client || state.status !== "ready") throw new BackendError("unauthenticated");
    return createSupabasePortalRepository(client);
  };
}

function Login() {
  const { state, client, login } = useAdsRuntime();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try { await login(email, password); }
    finally { setPassword(""); setBusy(false); }
  }
  return <div className="mx-auto max-w-md">
    <PageTitle title="メーカーとしてログイン" lead="店舗の募集を探すには、メーカー担当者のアカウントでログインしてください。" />
    <Card>
      {state.status === "guest" && state.error && <ErrorList errors={[state.error]} />}
      <form className="mt-4 space-y-4" onSubmit={submit}>
        <Field label="メールアドレス"><input className={inputClass} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="パスワード"><input className={inputClass} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Button type="submit" disabled={!client || busy}>{busy ? "ログイン中…" : "ログイン"}</Button>
      </form>
      <p className="mt-4 text-xs text-muted">この接続ではメーカー向けの募集閲覧を利用できます。アカウントと所属は担当者が設定します。</p>
    </Card>
  </div>;
}

export function AdsAccess({ children }: { children: ReactNode }) {
  const { source, state } = useAdsRuntime();
  const pathname = usePathname();
  if (source === "mock") return children;
  if (state.status === "loading") return <Loading />;
  if (state.status !== "ready") return <Login />;
  if (pathname === "/ads") return <>
    <PageTitle title="KAGO/Ads" lead="店舗の募集を比較し、掲載条件を確認できます。" />
    <Card><h2 className="font-bold">広告を出す店舗を探す</h2><p className="my-3 text-sm text-muted">募集一覧は共有DBから取得します。申請の保存・素材登録は現在接続準備中です。</p><ButtonLink href="/ads/portal">募集を探す</ButtonLink></Card>
  </>;
  if (pathname === "/ads/portal" || pathname.startsWith("/ads/portal/")) {
    // userIdを含め、同じ所属の別ユーザーへ切り替えた場合も前のデータを残さない。
    return <div key={state.identity.userId}>{children}</div>;
  }
  return <Card>
    <h1 className="text-xl font-bold">この操作はDB接続の準備中です</h1>
    <p className="mt-3 text-sm text-muted">申請内容の保存と素材登録はADS-03、店舗の募集作成はADS-02で接続します。この画面では保存は行いません。</p>
    <Link className="mt-4 inline-block text-brand underline" href="/ads/portal">募集一覧へ戻る</Link>
  </Card>;
}

export function ConnectedAdsHeader() {
  const { state, logout } = useAdsRuntime();
  return <header className="border-b border-line bg-surface">
    <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
      <Link href="/ads" className="font-bold"><span className="text-brand">KAGO</span>/Ads</Link>
      <Link href="/ads/portal" className="text-sm text-brand">募集を探す</Link>
      <Link href="/ads/portal/stores" className="text-sm text-brand">店舗一覧</Link>
      <span className="ml-auto text-xs text-muted">{state.status === "ready" ? "メーカーとしてログイン中" : "メーカー向けポータル"}</span>
      {state.status === "ready" && <Button variant="secondary" onClick={() => { void logout(); }}>ログアウト</Button>}
    </div>
  </header>;
}

export function AdsFooter() {
  const { source } = useAdsRuntime();
  return <footer className="border-t border-line px-6 py-4 text-center text-xs text-muted">
    {source === "mock"
      ? "仮データで動いています。店舗・メーカー・商品はデモ用の架空のものです。"
      : "募集一覧・店舗情報は共有DBを参照します。申請・募集作成の保存は接続準備中です。"}
  </footer>;
}
