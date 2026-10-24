"use client";
// Signage 端末の全画面表示（SIG-01〜03）。会場では Chrome のキオスクモードで /signage/play?device=D1 を開く
// ?debug=1 を付けると、通信・キャッシュ・未送信の記録の状態と、通信を切る確認用のボタンを出す
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AdMedia, PromoMedia } from "@/components/ad-media";
import { getRepository } from "@/lib/data";
import { FALLBACK_ASSET } from "@/lib/signage/feed";
import { SignageEngine, type EngineState, type Screen } from "./engine";

const kv = {
  get: (k: string) => window.localStorage.getItem(k),
  set: (k: string, v: string) => window.localStorage.setItem(k, v),
};

/** 素材を先に読み込み、ブラウザの中の URL にする（通信が切れても表示を続けるため） */
async function loadMedia(path: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status}`);
  return URL.createObjectURL(await res.blob());
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
        .filter((u) => u.startsWith(location.origin) && new URL(u).pathname.startsWith("/_next/static/"));
      reg.active?.postMessage({ type: "precache", urls: [location.href, ...urls] });
    })
    .catch(() => {
      // 登録できなくても、開いている間はブラウザの中の素材で動く
    });
}

const EMPTY: EngineState = { phase: "starting", screen: null, online: false, simulatedOffline: false, outbox: 0, sent: 0 };

export function SignagePlayer() {
  const params = useSearchParams();
  const deviceId = params.get("device") ?? "";
  const debug = params.get("debug") === "1";
  const [engine] = useState(() => (typeof window === "undefined" || !deviceId ? null : new SignageEngine({ repo: getRepository(), deviceId, kv, loadMedia })));
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

  if (!deviceId) {
    return <Message title="端末 ID がありません" body="/signage から端末を選んで開いてください（例：/signage/play?device=D1）" />;
  }

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
      {debug && <DebugPanel state={state} engine={engine!} />}
    </div>
  );
}

function ScreenView({ screen, engine }: { screen: Screen; engine: SignageEngine }) {
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

function DebugPanel({ state, engine }: { state: EngineState; engine: SignageEngine }) {
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
      </p>
      <button
        type="button"
        className="mt-2 rounded bg-white px-2 py-1 font-sans text-black"
        onClick={() => engine.setSimulatedOffline(!state.simulatedOffline)}
      >
        {state.simulatedOffline ? "通信を戻す" : "通信を切る（確認用）"}
      </button>
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
