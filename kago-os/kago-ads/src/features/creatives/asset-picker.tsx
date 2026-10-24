"use client";
// 広告素材の選択（ADS-03）。ファイルを選ぶとその場で仕様（docs/specs/ads-spec.md の 10 章）を確かめる
// 仮データではアップロードした素材はブラウザの中だけにある。COM-03（画像保存）ができたら Supabase Storage に上げる
import { useState } from "react";
import { formatBytes, IMAGE_TYPES, SIZE, validateAsset, VIDEO_TYPES } from "@/lib/domain/media";
import { CHANNEL_LABEL, type Channel, type MediaAsset } from "@/lib/domain/types";
import { AdMedia } from "@/components/ad-media";
import { ErrorList, inputClass } from "@/components/parts";

/** デモ用のサンプル素材（public/ad-assets。ADS-05） */
const SAMPLES: Record<Channel, MediaAsset[]> = {
  app: [1, 2].map((v) => ({
    kind: "image", path: `/ad-assets/CR1_v${v}_app.png`, width: 800, height: 800, bytes: 0, file_name: `CR1_v${v}_app.png`,
  })),
  signage: [
    { kind: "image", path: "/ad-assets/CR1_v1_signage.png", width: 1920, height: 1080, bytes: 0, file_name: "CR1_v1_signage.png" },
    { kind: "video", path: "/ad-assets/CR1_v2_signage.mp4", width: 1920, height: 1080, bytes: 0, duration_sec: 10, file_name: "CR1_v2_signage.mp4" },
  ],
};

async function readMeta(file: File, url: string) {
  if (file.type.startsWith("video/")) {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    await new Promise<void>((ok, ng) => {
      v.onloadedmetadata = () => ok();
      v.onerror = () => ng(new Error("動画を読み込めませんでした"));
    });
    return { width: v.videoWidth, height: v.videoHeight, durationSec: v.duration };
  }
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    throw new Error("画像を読み込めませんでした。ファイルが壊れていないか、PNG・JPEG・WebP か確かめてください");
  }
  return { width: img.naturalWidth, height: img.naturalHeight };
}

export function AssetPicker({
  channel,
  value,
  onChange,
  makerName,
}: {
  channel: Channel;
  value?: MediaAsset;
  onChange: (asset: MediaAsset | undefined) => void;
  makerName?: string;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const accept = (channel === "signage" ? [...IMAGE_TYPES, ...VIDEO_TYPES] : IMAGE_TYPES).join(",");
  const { width, height } = SIZE[channel];

  const onFile = async (file: File | undefined) => {
    setErrors([]);
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const meta = await readMeta(file, url);
      const problems = validateAsset({ type: file.type, bytes: file.size, ...meta }, channel);
      if (problems.length) {
        URL.revokeObjectURL(url);
        setErrors(problems);
        return;
      }
      onChange({
        kind: file.type.startsWith("video/") ? "video" : "image",
        path: url,
        width: meta.width,
        height: meta.height,
        bytes: file.size,
        duration_sec: "durationSec" in meta ? meta.durationSec : undefined,
        file_name: file.name,
      });
    } catch (e) {
      URL.revokeObjectURL(url);
      setErrors([e instanceof Error ? e.message : "ファイルを読み込めませんでした"]);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{CHANNEL_LABEL[channel]} 用の素材</p>
        <p className="text-xs text-muted">
          {width}×{height}・画像は2MB以下{channel === "signage" ? "・MP4 動画は15秒以内／20MB以下" : "（動画は使えません）"}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-xs text-muted">ファイルを選ぶ</span>
          <input type="file" accept={accept} className="mt-1 block w-full text-sm" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <label className="text-sm">
          <span className="text-xs text-muted">またはサンプル素材から選ぶ</span>
          <select
            className={`${inputClass} mt-1`}
            value={SAMPLES[channel].some((s) => s.path === value?.path) ? value?.path : ""}
            onChange={(e) => onChange(SAMPLES[channel].find((s) => s.path === e.target.value))}
          >
            <option value="">選ばない</option>
            {SAMPLES[channel].map((s) => (
              <option key={s.path} value={s.path}>
                {s.file_name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorList errors={errors} />
      {value && (
        <div className="space-y-2">
          <AdMedia asset={value} channel={channel} makerName={makerName} price="店舗の価格がここに入ります" className={channel === "app" ? "max-w-xs" : "max-w-xl"} />
          <p className="text-xs text-muted">
            {value.file_name}
            {value.bytes > 0 && `・${formatBytes(value.bytes)}`}
            {value.duration_sec !== undefined && `・${value.duration_sec.toFixed(1)}秒`}
            {value.path.startsWith("blob:") && "（仮データではページを再読み込みすると消えます）"}
          </p>
          <button type="button" className="text-xs text-red-700 underline" onClick={() => onChange(undefined)}>
            この素材を外す
          </button>
        </div>
      )}
    </div>
  );
}
