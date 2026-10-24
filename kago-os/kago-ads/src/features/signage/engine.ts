// Signage 端末の再生の仕組み（SIG-01〜03）。画面（player.tsx）はこの状態を表示するだけにする
// - 5秒ごとに、未送信の再生記録を送り、配信内容を取り直す（COM-01 案 F）
// - 取得した配信内容と未送信の記録は端末に保存し、通信が切れても再読み込みしても続きから動く（SIG-03）
// - 素材は先に読み込んでおき、読み込めたものだけを出す（画像欠落の対策）
import type { AdsRepository } from "@/lib/data/repository";
import type { PlayEndReason, Session, SignagePlay } from "@/lib/domain/types";
import { FALLBACK_ASSET, type FeedItem, type SignageFeed, type SignageReasonCode } from "@/lib/signage/feed";
import { decide, fallbackReason, pickNext, POLL_MS, type Playing } from "@/lib/signage/player";
import { endPlay, startPlay } from "@/lib/signage/plays";

export type Screen = {
  playId: string;
  /** null なら案内 */
  item: FeedItem | null;
  /** 読み込み済みの素材の URL。空なら案内の素材も読めていない（文字だけの案内を出す） */
  src: string;
  reasonCode: string;
};

export type EngineState = {
  phase: "starting" | "running" | "error";
  error?: string;
  storeName?: string;
  location?: string;
  screen: Screen | null;
  /** 直近の取得に成功したか */
  online: boolean;
  simulatedOffline: boolean;
  lastFetchAt?: string;
  cacheExpiresAt?: string;
  outbox: number;
  sent: number;
};

type Kv = { get(key: string): string | null; set(key: string, value: string): void };

export type EngineDeps = {
  repo: AdsRepository;
  deviceId: string;
  kv: Kv;
  /** 素材を読み込み、表示に使う URL を返す */
  loadMedia: (path: string) => Promise<string>;
  now?: () => number;
};

class OfflineError extends Error {}

export class SignageEngine {
  private state: EngineState = { phase: "starting", screen: null, online: false, simulatedOffline: false, outbox: 0, sent: 0 };
  private listeners = new Set<() => void>();
  private session: Session | null = null;
  private feed: SignageFeed | null = null;
  private playing: (Playing & { play: SignagePlay }) | null = null;
  private outbox = new Map<string, SignagePlay>();
  private media = new Map<string, { status: "loading" } | { status: "ready"; url: string } | { status: "error" }>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private polling = false;
  private readonly now: () => number;

  constructor(private readonly deps: EngineDeps) {
    this.now = deps.now ?? Date.now;
  }

  // ---- 画面から使う
  getState = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  async start() {
    this.state = { ...this.state, simulatedOffline: this.deps.kv.get(this.key("sim-offline")) === "1" };
    this.outbox = new Map(this.readJson<SignagePlay[]>("outbox", []).map((p) => [p.id, p]));
    this.feed = this.readJson<SignageFeed | null>("feed", null);
    this.session = this.readJson<Session | null>("session", null);
    void this.loadOne(FALLBACK_ASSET.path);
    if (this.feed) this.preload(this.feed);

    await this.poll();
    if (!this.session) {
      this.set({ phase: "error", error: "端末としてログインできません。端末 ID と通信を確認してください" });
      return;
    }
    this.set({ phase: "running", storeName: this.feed?.store_name, location: this.feed?.device.location });
    this.tick();
    this.timers.push(setInterval(() => this.tick(), 250));
    this.timers.push(setInterval(() => void this.poll(), POLL_MS));
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }

  /** 画面を閉じる・再読み込みするとき。再生中の記録を終えて保存し、次に開いたときに送る */
  close() {
    if (this.playing) this.finish("closed");
    this.playing = null;
  }

  onVideoEnded(playId: string) {
    if (this.playing?.play.id !== playId) return;
    this.playing.videoEnded = true;
    this.tick();
  }

  onMediaError(playId: string) {
    if (this.playing?.play.id !== playId) return;
    const path = this.state.screen?.item?.asset.path;
    if (path) this.media.set(path, { status: "error" });
    if (this.playing.key === null) {
      // 案内の素材も表示できない → 文字だけの案内にする
      this.set({ screen: this.state.screen && { ...this.state.screen, src: "" } });
      return;
    }
    this.switchTo("media_error");
  }

  /** 確認用：通信が切れた状態を作る（仮データは同じブラウザの中にあるため、本当の切断では試せない） */
  setSimulatedOffline(on: boolean) {
    this.deps.kv.set(this.key("sim-offline"), on ? "1" : "0");
    this.set({ simulatedOffline: on });
    void this.poll();
  }

  // ---- 取得と送信
  private async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      if (this.state.simulatedOffline) throw new OfflineError();
      if (!this.session) {
        this.session = await this.deps.repo.signInDevice(this.deps.deviceId);
        this.writeJson("session", this.session);
      }
      await this.flush();
      const feed = await this.deps.repo.getSignageFeed(this.session);
      this.feed = feed;
      this.writeJson("feed", feed);
      this.preload(feed);
      this.set({ online: true, lastFetchAt: feed.fetched_at, cacheExpiresAt: feed.expires_at, storeName: feed.store_name, location: feed.device.location });
    } catch {
      this.set({ online: false });
    } finally {
      this.polling = false;
    }
  }

  private async flush() {
    // DB では ended_at が必須なので、終わった記録だけを送る（再生中のものは端末に残す）
    const batch = [...this.outbox.values()].filter((p) => p.ended_at);
    if (!this.session || batch.length === 0) return;
    await this.deps.repo.recordPlays(this.session, batch);
    // 送っている間に更新された記録（終了の追記など）は残して次に送る
    for (const p of batch) if (this.outbox.get(p.id) === p) this.outbox.delete(p.id);
    this.saveOutbox();
    this.set({ sent: this.state.sent + batch.length });
  }

  private preload(feed: SignageFeed) {
    for (const item of feed.items) {
      const m = this.media.get(item.asset.path);
      if (!m || m.status === "error") void this.loadOne(item.asset.path);
    }
  }

  private async loadOne(path: string) {
    this.media.set(path, { status: "loading" });
    // 確認用の切断中も素材は読みにいく（本当の切断では Service Worker が保存した素材を返す）
    try {
      this.media.set(path, { status: "ready", url: await this.deps.loadMedia(path) });
    } catch {
      this.media.set(path, { status: "error" });
    }
    if (path === FALLBACK_ASSET.path && this.playing?.key === null) this.showFallback();
  }

  private ready = (item: FeedItem) => this.media.get(item.asset.path)?.status === "ready";

  // ---- 再生
  private tick() {
    if (this.state.phase !== "running") return;
    if (!this.playing) {
      this.startNext(null);
      return;
    }
    const d = decide(this.playing, this.feed, this.now(), this.ready);
    if (d.switch) this.switchTo(d.reason);
  }

  private switchTo(reason: PlayEndReason) {
    const last = this.playing && { key: this.playing.key, feedKeys: this.playing.feedKeys };
    this.finish(reason);
    this.startNext(last);
  }

  private startNext(last: { key: string | null; feedKeys: string[] } | null) {
    const now = this.now();
    const item = pickNext(this.feed, now, this.ready, last);
    const reason: SignageReasonCode = fallbackReason(this.feed, now);
    const play = startPlay(this.deps.deviceId, item, reason, this.storeTime(now));
    this.playing = {
      key: item?.key ?? null,
      kind: item?.asset.kind ?? "image",
      startedAtMs: now,
      durationSec: item?.asset.duration_sec,
      feedKeys: this.feed?.items.map((i) => i.key) ?? [],
      videoEnded: false,
      play,
    };
    this.put(play);
    if (item) {
      const m = this.media.get(item.asset.path);
      this.set({ screen: { playId: play.id, item, src: m?.status === "ready" ? m.url : "", reasonCode: play.reason_code } });
    } else this.showFallback();
  }

  private showFallback() {
    if (!this.playing || this.playing.key !== null) return;
    const m = this.media.get(FALLBACK_ASSET.path);
    this.set({ screen: { playId: this.playing.play.id, item: null, src: m?.status === "ready" ? m.url : "", reasonCode: this.playing.play.reason_code } });
  }

  private finish(reason: PlayEndReason) {
    if (!this.playing) return;
    this.put(endPlay(this.playing.play, this.storeTime(this.now()), reason));
  }

  /** 記録の時刻は店舗の時刻（デモ用の時刻があればその時刻） */
  private storeTime(realMs: number) {
    return new Date(realMs + (this.feed?.clock_offset_ms ?? 0)).toISOString();
  }

  private put(play: SignagePlay) {
    this.outbox.set(play.id, play);
    this.saveOutbox();
  }

  private saveOutbox() {
    this.writeJson("outbox", [...this.outbox.values()]);
    this.set({ outbox: this.outbox.size });
  }

  // ---- 状態の通知と保存
  private set(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private key(name: string) {
    return `kago-signage-${name}-v1:${this.deps.deviceId}`;
  }

  private readJson<T>(name: string, fallback: T): T {
    try {
      const raw = this.deps.kv.get(this.key(name));
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private writeJson(name: string, value: unknown) {
    try {
      this.deps.kv.set(this.key(name), JSON.stringify(value));
    } catch {
      // 保存できない環境では、開いている間だけ動かす
    }
  }
}
