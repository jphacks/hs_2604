// Signage の再生の切り替え判定（SIG-01・SIG-03）。画面とタイマーから切り離した純粋な関数
// 決まり（COM-01 案 E・F）：
// - 画像は1枠10秒。版が変わったら、表示3秒以上で切り替える（3秒未満なら3秒まで待つ）
// - 動画は最後まで再生してから切り替える
// - 停止・期限切れはすぐ切り替える
// - 取得できない間はキャッシュの期限（10分）まで表示を続け、過ぎたら案内にする
import type { PlayEndReason, Timestamp } from "../domain/types";
import type { FeedItem, SignageFeed, SignageReasonCode } from "./feed";

export const POLL_MS = 5_000;
export const IMAGE_SEC = 10;
export const MIN_PLAY_SEC = 3;
/** 動画が終わらない（止まった）ときに諦めるまでの余裕 */
const VIDEO_GRACE_SEC = 5;

/** 今表示しているもの。key が null なら案内 */
export type Playing = {
  key: string | null;
  kind: "image" | "video";
  /** 端末の実時刻（ミリ秒） */
  startedAtMs: number;
  /** 動画の長さ（秒）。分からなければ undefined */
  durationSec?: number;
  /** 再生を始めたときの一覧の key（版が変わったかの判定に使う） */
  feedKeys: string[];
  videoEnded: boolean;
};

export type Decision = { switch: false } | { switch: true; reason: PlayEndReason };

const ms = (ts: Timestamp) => Date.parse(ts);

/** キャッシュが使える期限内か */
export function isFresh(feed: SignageFeed | null, realNowMs: number): feed is SignageFeed {
  return !!feed && realNowMs < ms(feed.expires_at);
}

/** 今出してよいもの。期限切れのキャッシュ・期間を過ぎたもの・素材を読めないものは除く */
export function playableItems(feed: SignageFeed | null, realNowMs: number, ready: (item: FeedItem) => boolean): FeedItem[] {
  if (!isFresh(feed, realNowMs)) return [];
  const storeNowMs = realNowMs + feed.clock_offset_ms;
  return feed.items.filter((i) => storeNowMs < ms(i.valid_until) && ready(i));
}

/** 案内を出す理由 */
export function fallbackReason(feed: SignageFeed | null, realNowMs: number): SignageReasonCode {
  if (!isFresh(feed, realNowMs)) return "cache_expired";
  const storeNowMs = realNowMs + feed.clock_offset_ms;
  return feed.items.some((i) => storeNowMs < ms(i.valid_until)) ? "media_unavailable" : "no_content";
}

export function sameKeys(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

/** 今の表示を続けるか、切り替えるか */
export function decide(p: Playing, feed: SignageFeed | null, realNowMs: number, ready: (item: FeedItem) => boolean): Decision {
  const elapsed = (realNowMs - p.startedAtMs) / 1000;
  const playable = playableItems(feed, realNowMs, ready);

  if (p.key === null) {
    // 案内は数えないので、出せるものができたらすぐ切り替える
    return playable.length > 0 ? { switch: true, reason: "updated" } : { switch: false };
  }

  if (!isFresh(feed, realNowMs)) return { switch: true, reason: "expired" };
  if (feed.suspended_keys.includes(p.key)) return { switch: true, reason: "suspended" };
  const item = feed.items.find((i) => i.key === p.key);
  if (item && realNowMs + feed.clock_offset_ms >= ms(item.valid_until)) return { switch: true, reason: "expired" };

  const changed = !item || !sameKeys(p.feedKeys, feed.items.map((i) => i.key));
  if (p.kind === "video") {
    if (p.videoEnded) return { switch: true, reason: "completed" };
    if (elapsed >= (p.durationSec ?? IMAGE_SEC) + VIDEO_GRACE_SEC) return { switch: true, reason: "media_error" };
    return { switch: false };
  }
  if (elapsed >= IMAGE_SEC) return { switch: true, reason: "completed" };
  if (changed && elapsed >= MIN_PLAY_SEC) return { switch: true, reason: "updated" };
  return { switch: false };
}

/**
 * 次に出すもの。一覧が変わって新しく入ったものがあれば、それを先に出す（デモ手順①の「設定すると画面が変わる」）。
 * なければ今のものの次。出せるものがなければ null（案内）
 */
export function pickNext(
  feed: SignageFeed | null,
  realNowMs: number,
  ready: (item: FeedItem) => boolean,
  last: { key: string | null; feedKeys: string[] } | null,
): FeedItem | null {
  const list = playableItems(feed, realNowMs, ready);
  if (list.length === 0) return null;
  if (last && last.feedKeys.length > 0) {
    const added = list.find((i) => !last.feedKeys.includes(i.key));
    if (added) return added;
  }
  const idx = last?.key ? list.findIndex((i) => i.key === last.key) : -1;
  if (idx >= 0) return list[(idx + 1) % list.length];
  // 今のものが一覧から消えたときは、元の一覧で次にあったものから探す
  if (last?.key) {
    const pos = last.feedKeys.indexOf(last.key);
    for (const k of [...last.feedKeys.slice(pos + 1), ...last.feedKeys.slice(0, pos)]) {
      const next = list.find((i) => i.key === k);
      if (next) return next;
    }
  }
  return list[0];
}
