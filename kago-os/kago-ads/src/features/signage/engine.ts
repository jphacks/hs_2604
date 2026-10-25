// Signage 端末の再生の仕組み（SIG-01〜03）。画面（player.tsx）はこの状態を表示するだけにする
// - 5秒ごとに、未送信の再生記録を送り、配信内容を取り直す（COM-01 案 F）
// - 取得した配信内容と未送信の記録は端末に保存し、通信が切れても再読み込みしても続きから動く（SIG-03）
// - 素材は先に読み込んでおき、読み込めたものだけを出す（画像欠落の対策）
import type { PlayEndReason, Session, SignagePlay } from "@/lib/domain/types";
import { FALLBACK_ASSET, type FeedItem, type SignageFeed, type SignageReasonCode } from "@/lib/signage/feed";
import { decide, fallbackReason, pickNext, POLL_MS, MIN_PLAY_SEC, type Playing } from "@/lib/signage/player";
import { endPlay, startPlay } from "@/lib/signage/plays";
import type { CrowdDecision } from "@/lib/signage/crowd-selection";
import { NeedLoginError, type SignageSource } from "./source";

export type Screen = {
  playId: string;
  /** null なら案内 */
  item: FeedItem | null;
  /** 読み込み済みの素材の URL。空なら案内の素材も読めていない（文字だけの案内を出す） */
  src: string;
  reasonCode: string;
};

export type EngineState = {
  /** login：端末のアカウントでのログインが必要（DB 版） */
  phase: "starting" | "running" | "login" | "error";
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
  /** DB に受け付けられず捨てた記録の数（中身が配信対象・期間と合わない など） */
  rejected: number;
  selection?: CrowdDecision;
};

type Kv = { get(key: string): string | null; set(key: string, value: string): void };

export type EngineDeps = {
  source: SignageSource;
  kv: Kv;
  /** 素材を読み込み、表示に使う URL を返す */
  loadMedia: (path: string) => Promise<string>;
  now?: () => number;
  /** Optional aggregate selector; enable DB selection only after migration. */
  persistSelection?: boolean;
  select?: (feed: SignageFeed, now: Date, ready: (item: FeedItem) => boolean) => CrowdDecision;
};

class OfflineError extends Error {}

export class SignageEngine {
  private state: EngineState = { phase: "starting", screen: null, online: false, simulatedOffline: false, outbox: 0, sent: 0, rejected: 0 };
  private listeners = new Set<() => void>();
  private session: Session | null = null;
  private feed: SignageFeed | null = null;
  private playing: (Playing & { play: SignagePlay }) | null = null;
  private outbox = new Map<string, SignagePlay>();
  private media = new Map<string, { status: "loading" } | { status: "ready"; url: string } | { status: "error" }>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private polling = false;
  private needLogin = false;
  private verified = false;
  private readonly now: () => number;

  constructor(private readonly deps: EngineDeps) {
    this.now = deps.now ?? Date.now;
  }

  private selections: {play_id:string;decision:CrowdDecision}[]=[];

  // ---- 画面から使う
  getState = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSelectionHistory = () => this.selections;
  async refresh() { await this.poll(); this.tick(); }

  async start() {
    this.state = { ...this.state, simulatedOffline: this.deps.kv.get(this.key("sim-offline")) === "1" };
    this.outbox = new Map(this.readJson<SignagePlay[]>("outbox", []).map((p) => [p.id, p]));
    this.feed = this.readJson<SignageFeed | null>("feed", null);
    this.session = this.readJson<Session | null>("session", null);
    void this.loadOne(FALLBACK_ASSET.path);
    if (this.feed) this.preload(this.feed);

    await this.poll();
    this.begin();
  }

  /** ログイン画面でログインした後に呼ぶ */
  async afterLogin() {
    this.needLogin = false;
    await this.poll();
    this.begin();
  }

  /** 端末からログアウトしたとき。保存した配信内容は消し、未送信の記録は次のログインで送るので残す */
  signedOut() {
    this.close();
    this.stop();
    this.session = null;
    this.verified = false;
    this.feed = null;
    this.writeJson("session", null);
    this.writeJson("feed", null);
    this.set({ phase: "login", screen: null, online: false, lastFetchAt: undefined, cacheExpiresAt: undefined });
  }

  private begin() {
    if (!this.session) {
      if (this.needLogin) this.set({ phase: "login" });
      else this.set({ phase: "error", error: "端末としてログインできません。端末 ID と通信を確認してください" });
      return;
    }
    this.set({ phase: "running", storeName: this.feed?.store_name, location: this.feed?.device.location });
    if (this.timers.length > 0) return;
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
      if (!this.session || !this.verified) {
        // 起動後の最初の取得では、保存したログイン情報を信じずに確かめる。通信できないときだけ保存した情報で続ける
        this.session = await this.deps.source.signIn();
        this.verified = true;
        this.writeJson("session", this.session);
      }
      // 記録を送れなくても配信内容は取り直す（ログインが切れたときだけ止める）
      await this.flush().catch((error: unknown) => {
        if (error instanceof NeedLoginError) throw error;
      });
      const feed = await this.deps.source.getFeed(this.session);
      this.feed = feed;
      this.writeJson("feed", feed);
      this.preload(feed);
      this.set({ online: true, lastFetchAt: feed.fetched_at, cacheExpiresAt: feed.expires_at, storeName: feed.store_name, location: feed.device.location });
    } catch (error) {
      this.set({ online: false });
      if (error instanceof NeedLoginError) {
        // ログインが切れた：表示をやめてログイン画面にする（別の端末のアカウントの内容を出し続けない）
        this.needLogin = true;
        if (this.state.phase === "running") this.signedOut();
        else this.session = null;
      }
    } finally {
      this.polling = false;
    }
  }

  private async flush() {
    // DB では ended_at が必須なので、終わった記録だけを送る（再生中のものは端末に残す）。
    // 送るのはログイン中の端末の記録だけ。別の端末のアカウントの記録は、その端末で入り直したときに送る
    const deviceId = this.session?.role === "signage" ? this.session.deviceId : null;
    const batch = [...this.outbox.values()].filter((p) => p.ended_at && p.device_id === deviceId);
    if (!this.session || batch.length === 0) return;
    const { rejected } = await this.deps.source.recordPlays(this.session, batch);
    // 送っている間に更新された記録（終了の追記など）は残して次に送る。受け付けられなかった記録は送り直しても通らないので捨てる
    for (const p of batch) if (this.outbox.get(p.id) === p) this.outbox.delete(p.id);
    this.saveOutbox();
    this.set({ sent: this.state.sent + batch.length - rejected.length, rejected: this.state.rejected + rejected.length });
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
      // 起動直後に素材を読み込み中なら、案内を出さずに待つ（読み込めなかったときだけ案内にする）
      const loading = this.feed?.items.some((i) => this.media.get(i.asset.path)?.status === "loading");
      if (loading && !this.feed?.items.some(this.ready)) return;
      this.startNext(null);
      return;
    }
    const selection=this.selection();
    // A suppressed aggregate must not restart fallback every tick just because ads exist.
    if(selection&&this.playing.key===null&&selection.selected_key===null){
      if(this.playing.play.reason_code!==selection.reason_code)this.switchTo("updated");
      return;
    }
    const d = decide(this.playing, this.feed, this.now(), this.ready);
    if (d.switch) { this.switchTo(d.reason); return; }
    if(selection&&selection.selected_key!==this.playing.key){
      const elapsed=(this.now()-this.playing.startedAtMs)/1000;
      if(selection.selected_key===null||this.playing.key===null||(this.playing.kind==="image"&&elapsed>=MIN_PLAY_SEC))this.switchTo("updated");
    }
  }

  private switchTo(reason: PlayEndReason) {
    const last = this.playing && { key: this.playing.key, feedKeys: this.playing.feedKeys };
    this.finish(reason);
    this.startNext(last);
  }

  private selection() {
    return this.deps.select&&this.feed?this.deps.select(this.feed,new Date(this.now()),this.ready):undefined;
  }

  private startNext(last: { key: string | null; feedKeys: string[] } | null) {
    const now = this.now();
    const selection=this.selection();
    const selected=selection&&this.feed?.items.find(i=>i.key===selection.selected_key&&this.ready(i));
    const item = selection ? (selected?{...selected,reason_code:selection.reason_code}:null) : pickNext(this.feed, now, this.ready, last);
    const reason: SignageReasonCode = selection?.reason_code ?? fallbackReason(this.feed, now);
    const deviceId = this.session?.role === "signage" ? this.session.deviceId : this.deps.source.cacheKey;
    const play = startPlay(deviceId, item, reason, this.storeTime(now));
    if(selection){
      play.mode=item?"adaptive":"fallback";
      play.data_origin=selection.snapshot?.data_origin??(this.deps.persistSelection?"operated":"synthetic");
      if(this.deps.persistSelection)play.selection=selection;
      this.selections=[...this.selections,{play_id:play.id,decision:selection}].slice(-20);
      this.set({selection});
    }
    this.playing = {
      key: item?.key ?? null,
      kind: item?.asset.kind ?? "image",
      startedAtMs: now,
      durationSec: item?.asset.duration_sec,
      feedKeys: this.feed?.items.map((i) => i.key) ?? [],
      groupKey: item?.group_key,
      validUntil: item?.valid_until,
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
    return `kago-signage-${name}-v1:${this.deps.source.cacheKey}`;
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
