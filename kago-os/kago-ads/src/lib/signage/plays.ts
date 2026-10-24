// 再生記録（SIG-02）の作成・再送・数え方
// 記録はすべて残し、「再生1回」に数えるかは集計側で判定する（共通仕様書 9.3、COM-01 案 E）
import type { PlayEndReason, SignagePlay, Timestamp } from "../domain/types";
import type { FeedItem, SignageReasonCode } from "./feed";
import { MIN_PLAY_SEC } from "./player";

export function newPlayId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `play-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 再生を始めたときの記録。item が null なら案内（mode = fallback） */
export function startPlay(
  deviceId: string,
  item: FeedItem | null,
  fallbackReason: SignageReasonCode,
  startedAt: Timestamp,
  id: string = newPlayId(),
): SignagePlay {
  return {
    id,
    device_id: deviceId,
    ad_placement_id: item?.ad_placement_id ?? null,
    promotion_version_id: item?.promotion_version_id ?? null,
    creative_version_id: item?.creative_version_id ?? null,
    mode: item ? "schedule" : "fallback",
    reason_code: item ? item.reason_code : fallbackReason,
    started_at: startedAt,
    ended_at: null,
    data_origin: "operated",
    media_kind: item?.asset.kind ?? "image",
    end_reason: null,
  };
}

export function endPlay(play: SignagePlay, endedAt: Timestamp, reason: PlayEndReason): SignagePlay {
  return { ...play, ended_at: endedAt, end_reason: reason };
}

export function playSeconds(p: SignagePlay): number | null {
  if (!p.ended_at) return null;
  const sec = (Date.parse(p.ended_at) - Date.parse(p.started_at)) / 1000;
  return sec >= 0 ? sec : null;
}

/**
 * 再生回数に数えるか（DB-09 に渡す決まり）
 * - 終わっていて、長さが負でない
 * - 案内（fallback）ではない
 * - 3秒以上表示した
 * - 動画は最後まで再生した（停止などで途中で切ったものは0回。COM-01 案 F）
 */
export function isCountedPlay(p: SignagePlay): boolean {
  const sec = playSeconds(p);
  if (sec === null || p.mode === "fallback" || sec < MIN_PLAY_SEC) return false;
  if (p.media_kind === "video" && p.end_reason !== "completed") return false;
  return true;
}

/** 記録の対象（配信対象または販促の版）。案内は "fallback" */
export const playTarget = (p: SignagePlay) => p.ad_placement_id ?? p.promotion_version_id ?? "fallback";

export type PlaySummary = { target: string; saved: number; counted: number; seconds: number };

/** 対象ごとの再生回数・再生秒数（共通仕様書 9.3。案内は回数に含めず、別の行で件数だけ出す） */
export function summarizePlays(plays: SignagePlay[]): PlaySummary[] {
  const map = new Map<string, PlaySummary>();
  for (const p of plays) {
    const target = playTarget(p);
    const row = map.get(target) ?? { target, saved: 0, counted: 0, seconds: 0 };
    row.saved += 1;
    if (isCountedPlay(p)) {
      row.counted += 1;
      row.seconds += playSeconds(p)!;
    }
    map.set(target, row);
  }
  return [...map.values()].map((r) => ({ ...r, seconds: Math.round(r.seconds) }));
}

/** 受け取った記録を保存する。同じ id がすでにあれば最初のものを残す（再送しても増えず、受信時刻も変わらない） */
export function mergePlay(existing: SignagePlay | undefined, incoming: SignagePlay, receivedAt: Timestamp): SignagePlay {
  return existing ?? { ...incoming, received_at: receivedAt };
}
