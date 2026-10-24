// 広告素材の表示。Ads のプレビュー（ADS-03）と Signage の全画面表示（SIG-01）で共通に使う
// 「広告｜提供：〇〇」と価格は素材に入れず、ここで重ねる（docs/specs/ads-spec.md の 10 章）
import { OVERLAY_ZONES, SIZE, zoneStyle } from "@/lib/domain/media";
import type { Channel, MediaAsset } from "@/lib/domain/types";

export function AdMedia({
  asset,
  channel,
  makerName,
  price,
  autoPlay = false,
  className = "",
}: {
  asset: MediaAsset;
  channel: Channel;
  /** 渡すと「広告｜提供：〇〇」を重ねる */
  makerName?: string;
  /** 渡すと価格を重ねる（DB-02 の店舗別価格）。文字列ならそのまま出す（申請前のプレビュー用） */
  price?: number | string;
  autoPlay?: boolean;
  className?: string;
}) {
  const zones = OVERLAY_ZONES[channel];
  const { width, height } = SIZE[channel];
  return (
    <div
      className={`relative overflow-hidden bg-black/5 [container-type:inline-size] ${className}`}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      {asset.kind === "video" ? (
        <video
          src={asset.path}
          className="h-full w-full object-contain"
          muted
          playsInline
          loop={autoPlay}
          autoPlay={autoPlay}
          controls={!autoPlay}
        />
      ) : (
        // 素材は外部・アップロードのURLもあるため next/image ではなく img を使う
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.path} alt="" className="h-full w-full object-contain" />
      )}
      {makerName && (
        <div className="absolute flex items-center whitespace-nowrap" style={zoneStyle(zones.label, channel)}>
          <span
            className="rounded bg-black/75 font-medium text-white"
            style={{ fontSize: channel === "app" ? "3.6cqw" : "2.1cqw", padding: "0.4cqw 1.2cqw" }}
          >
            広告｜提供：{makerName}
          </span>
        </div>
      )}
      {price !== undefined && (
        <div className="absolute flex items-center justify-end whitespace-nowrap" style={zoneStyle(zones.price, channel)}>
          <span
            className="rounded-lg bg-white font-extrabold text-red-700 shadow"
            style={{ fontSize: channel === "app" ? "9cqw" : "6.5cqw", padding: "0.6cqw 1.8cqw" }}
          >
            {typeof price === "number" ? (
              <>
                ¥{price.toLocaleString("ja-JP")}
                <small className="ml-1 font-medium text-gray-500" style={{ fontSize: "40%" }}>
                  （税込）
                </small>
              </>
            ) : (
              <span className="font-medium text-gray-500" style={{ fontSize: "45%" }}>
                {price}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
