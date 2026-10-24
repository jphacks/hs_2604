// 広告素材の仕様（docs/specs/ads-spec.md の 10 章）
import type { Channel } from "./types";

export const SIZE: Record<Channel, { width: number; height: number }> = {
  signage: { width: 1920, height: 1080 },
  app: { width: 800, height: 800 },
};

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const VIDEO_TYPES = ["video/mp4"];
/** 上限は仮。COM-03 の上限と合わせる */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_SEC = 15;

type Zone = { x: number; y: number; w: number; h: number };

/** 画面側で重ねる領域（素材のピクセル座標）。scripts/ad-assets/generate.py の ZONES と同じ値 */
export const OVERLAY_ZONES: Record<Channel, { label: Zone; price: Zone }> = {
  signage: { label: { x: 40, y: 40, w: 640, h: 72 }, price: { x: 1360, y: 800, w: 520, h: 240 } },
  app: { label: { x: 24, y: 24, w: 400, h: 52 }, price: { x: 496, y: 664, w: 280, h: 112 } },
};

/** 領域を素材に対する割合（%）にする。表示サイズが変わっても同じ位置に重ねられる */
export function zoneStyle(zone: Zone, channel: Channel) {
  const { width, height } = SIZE[channel];
  return {
    left: `${(zone.x / width) * 100}%`,
    top: `${(zone.y / height) * 100}%`,
    width: `${(zone.w / width) * 100}%`,
    height: `${(zone.h / height) * 100}%`,
  };
}

export type AssetMeta = {
  type: string;
  bytes: number;
  width: number;
  height: number;
  durationSec?: number;
};

/** 素材が仕様に合うか調べ、問題があれば日本語の理由を返す（空なら OK） */
export function validateAsset(meta: AssetMeta, channel: Channel): string[] {
  const errors: string[] = [];
  const isImage = IMAGE_TYPES.includes(meta.type);
  const isVideo = VIDEO_TYPES.includes(meta.type);
  const { width, height } = SIZE[channel];

  if (!isImage && !isVideo) {
    errors.push("PNG・JPEG・WebP の画像か、MP4 の動画を選んでください");
    return errors;
  }
  if (isVideo && channel === "app") {
    errors.push("動画は Signage だけで使えます。App には画像を選んでください");
  }
  if (isImage && meta.bytes > MAX_IMAGE_BYTES) {
    errors.push(`画像は 2MB 以下にしてください（今は ${formatBytes(meta.bytes)}）`);
  }
  if (isVideo && meta.bytes > MAX_VIDEO_BYTES) {
    errors.push(`動画は 20MB 以下にしてください（今は ${formatBytes(meta.bytes)}）`);
  }
  if (isVideo && (meta.durationSec ?? Infinity) > MAX_VIDEO_SEC) {
    errors.push(`動画は ${MAX_VIDEO_SEC} 秒以内にしてください（今は ${meta.durationSec?.toFixed(1) ?? "不明"} 秒）`);
  }
  if (meta.width !== width || meta.height !== height) {
    errors.push(`${width}×${height} にしてください（今は ${meta.width}×${meta.height}）`);
  }
  return errors;
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.round(bytes / 1024)}KB`;
}
