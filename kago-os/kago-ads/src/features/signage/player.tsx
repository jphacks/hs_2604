"use client";
// Signage 端末の全画面表示（SIG-01〜03）。会場では Chrome のキオスクモードで /signage/play を開く
// - DB 版（既定）：端末のアカウント（signage 役割）でログインする。端末・店舗はアカウントから決まり、URL では選ばない
// - 仮データ版（NEXT_PUBLIC_ADS_DATA_SOURCE=mock）：/signage/play?device=D1 のように端末 ID を付けて開く
// ?debug=1 を付けると、通信・キャッシュ・未送信の記録の状態と、確認用のボタン（通信を切る・ログアウト）を出す
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { getAdImageUrl, signOutBackend, toBackendError } from "@kago/backend";
import { AdMedia, PromoMedia } from "@/components/ad-media";
import { Button, ErrorList, Field, inputClass } from "@/components/parts";
import { adsDataSource, createSignageBackend } from "@/lib/backend/config";
import { signInDevice, type SignageClient } from "@/lib/backend/signage";
import { getRepository } from "@/lib/data";
import { selectCrowdAd } from "@/lib/signage/crowd-selection";
import { FALLBACK_ASSET } from "@/lib/signage/feed";
import { SignageEngine, type EngineState, type Screen } from "./engine";
import { clearMediaCache, createMediaLoader } from "./media";
import { mockSignageSource, supabaseSignageSource } from "./source";

const kv = {
  get: (k: string) => window.localStorage.getItem(k),
  set: (k: string, v: string) => window.localStorage.setItem(k, v),
};

type Setup =
  | { kind: "ready"; engine: SignageEngine; client: SignageClient | null }
  | { kind: "no-device" }
  | { kind: "error"; message: string };

/** 接続先（DB／仮データ）に合わせて再生の仕組みを用意する。設定の誤りは仮データに戻さずエラーにする */
function createSetup(deviceId: string): Setup {
  try {
    if (adsDataSource() === "mock") {
      if (!deviceId) return { kind: "no-device" };
      return { kind: "ready", client: null, engine: new SignageEngine({ source: mockSignageSource(getRepository(), deviceId), kv, loadMedia: createMediaLoader() }) };
    }
    const client = createSignageBackend();
    const loadMedia = createMediaLoader({ signedUrl: async (path) => (await getAdImageUrl(client, path)).url });
    const crowd=process.env.NEXT_PUBLIC_SIGNAGE_CROWD_SELECTION==="1";
    return { kind: "ready", client, engine: new SignageEngine({ source: supabaseSignageSource(client,{crowd}), kv, loadMedia, persistSelection:crowd,
      select:crowd?(feed,now,ready)=>selectCrowdAd(feed,feed.crowd?.categoryByKey??{},feed.crowd?.snapshot??null,now,ready):undefined }) };
  } catch (error) {
    return { kind: "error", message: toBackendError(error).message };
  }
}

function registerServiceWorker() {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("/signage/sw.js", { scope: "/signage/" })
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => {
      // 最初に開いたときに読み込んだ画面の部品も、再読み込みに備えて保存してもらう
      const urls = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((u) => u.startsWith(location.origin) && ["/_next/static/", "/ads-static/_next/static/"].some((prefix) => new URL(u).pathname.startsWith(prefix)));
      reg.active?.postMessage({ type: "precache", urls: [location.href, ...urls] });
    })
    .catch(() => {
      // 登録できなくても、開いている間はブラウザの中の素材で動く
    });
}

const EMPTY: EngineState = { phase: "starting", screen: null, online: false, simulatedOffline: false, outbox: 0, sent: 0, rejected: 0 };

export function SignagePlayer() {
  const params = useSearchParams();
  const deviceId = params.get("device") ?? "";
  const debug = params.get("debug") === "1";
  const [setup] = useState<Setup | null>(() => (typeof window === "undefined" ? null : createSetup(deviceId)));
  const engine = setup?.kind === "ready" ? setup.engine : null;
  const client = setup?.kind === "ready" ? setup.client : null;
  const state = useSyncExternalStore(engine?.subscribe ?? noopSubscribe, engine?.getState ?? emptyState, emptyState);

  useEffect(() => {
    if (!engine) return;
    registerServiceWorker();
    void engine.start();
    const onHide = () => engine.close();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      engine.close();
      engine.stop();
    };
  }, [engine]);

  if (setup?.kind === "no-device") {
    return <Message title="端末 ID がありません" body="/signage から端末を選んで開いてください（例：/signage/play?device=D1）" />;
  }
  if (setup?.kind === "error") return <Message title="接続の設定を確認してください" body={setup.message} />;
  if (state.phase === "login" && client && engine) return <DeviceLogin client={client} engine={engine} />;

  return (
    <div
      className="fixed inset-0 flex cursor-none items-center justify-center overflow-hidden bg-black"
      onClick={() => void document.documentElement.requestFullscreen?.().catch(() => {})}
    >
      {state.phase === "error" ? (
        <Message title="表示を始められません" body={state.error ?? ""} />
      ) : state.screen ? (
        <div style={{ width: "min(100vw, calc(100vh * 16 / 9))" }}>
          <ScreenView screen={state.screen} engine={engine!} />
        </div>
      ) : null}
      {debug && engine && <DebugPanel state={state} engine={engine} client={client} />}
    </div>
  );
}

export function ScreenView({ screen, engine }: { screen: Screen; engine: SignageEngine }) {
  const { item, src, playId } = screen;
  const onError = () => engine.onMediaError(playId);
  if (!item) {
    return src ? (
      <AdMedia key={playId} asset={FALLBACK_ASSET} channel="signage" src={src} onError={onError} className="w-full" />
    ) : (
      <div className="flex aspect-video w-full flex-col items-center justify-center bg-[#14213d] text-white">
        <p className="text-[4vw] font-bold">スマホでスキャンして、そのままお会計。</p>
        <p className="mt-[1vw] text-[2vw] text-yellow-300">KAGO App で、レジに並ばずお買い物</p>
      </div>
    );
  }
  if (item.placement_type === "store_promo") {
    return (
      <PromoMedia
        key={playId}
        asset={item.asset}
        channel="signage"
        src={src}
        productName={item.product_name}
        reasonText={item.reason_text ?? ""}
        price={item.price}
        onError={onError}
        className="w-full"
      />
    );
  }
  return (
    <AdMedia
      key={playId}
      asset={item.asset}
      channel="signage"
      src={src}
      makerName={item.maker_name}
      price={item.price}
      autoPlay
      loop={false}
      onEnded={() => engine.onVideoEnded(playId)}
      onError={onError}
      className="w-full"
    />
  );
}

/** 端末のアカウントでのログイン。会場で一度ログインすれば、Supabase のクライアントが端末に保存して次回から自動で入る */
function DeviceLogin({ client, engine }: { client: SignageClient; engine: SignageEngine }) {
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setErrors([]);
    try {
      await signInDevice(client, String(form.get("email") ?? ""), String(form.get("password") ?? ""));
      await engine.afterLogin();
    } catch (error) {
      setErrors([toBackendError(error).message]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6">
      <p className="text-sm font-semibold text-brand">KAGO/Signage</p>
      <h1 className="mt-1 text-2xl font-bold">端末のログイン</h1>
      <p className="mt-2 text-sm text-muted">Signage 端末用のアカウントでログインします。表示する店舗と端末はアカウントで決まります。</p>
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <Field label="メールアドレス">
          <input name="email" type="email" autoComplete="username" required className={inputClass} />
        </Field>
        <Field label="パスワード">
          <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
        </Field>
        <ErrorList errors={errors} />
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "確認中…" : "ログインして表示を始める"}
        </Button>
      </form>
    </main>
  );
}

function DebugPanel({ state, engine, client }: { state: EngineState; engine: SignageEngine; client: SignageClient | null }) {
  const s = state.screen;
  return (
    <div
      className="absolute bottom-3 left-3 cursor-auto rounded-lg bg-black/75 p-3 font-mono text-xs leading-5 text-white"
      onClick={(e) => e.stopPropagation()}
      data-testid="signage-debug"
    >
      <p>
        {state.storeName} {state.location}｜{state.online ? "通信：OK" : "通信：切断"}
        {state.simulatedOffline && "（確認用に切断中）"}
      </p>
      <p>表示中：{s ? (s.item ? `${s.item.placement_type === "sponsored" ? "広告" : "販促"} ${s.item.key}` : "案内") : "－"}（{s?.reasonCode}）</p>
      <p>最終取得：{fmt(state.lastFetchAt)}｜キャッシュの期限：{fmt(state.cacheExpiresAt)}</p>
      <p>
        未送信の記録：{state.outbox}件｜送信済み：{state.sent}件
        {state.rejected > 0 && `｜受け付けられなかった記録：${state.rejected}件`}
      </p>
      <p>接続先：{client ? "DB（Supabase）" : "仮データ"}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="rounded bg-white px-2 py-1 font-sans text-black"
          onClick={() => engine.setSimulatedOffline(!state.simulatedOffline)}
        >
          {state.simulatedOffline ? "通信を戻す" : "通信を切る（確認用）"}
        </button>
        {client && (
          <button
            type="button"
            className="rounded bg-white px-2 py-1 font-sans text-black"
            onClick={async () => {
              await signOutBackend(client).catch(() => undefined);
              await clearMediaCache();
              engine.signedOut();
            }}
          >
            端末からログアウト
          </button>
        )}
      </div>
    </div>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#14213d] p-8 text-center text-white">
      <p className="text-2xl font-bold">{title}</p>
      <p className="mt-2 text-white/80">{body}</p>
    </div>
  );
}

const fmt = (ts?: string) => (ts ? new Date(ts).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo" }) : "－");
const noopSubscribe = () => () => {};
const emptyState = () => EMPTY;
