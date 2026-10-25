"use client";
import { useEffect, useState } from "react";
import { getAdImageUrl } from "@kago/backend";
import { AdMedia } from "@/components/ad-media";
import { useAdsRuntime } from "@/features/auth/ads-runtime";

/** 署名URLはDBに保存せず、表示中は期限より前に本人権限で更新する。 */
export function ConnectedAdMedia(props: React.ComponentProps<typeof AdMedia>) {
  const { client } = useAdsRuntime();
  const { asset } = props;
  const [renewed, setRenewed] = useState<{ original: string; url: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!client || !asset.storage_path) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const value = await getAdImageUrl(client!, asset.storage_path!);
        if (!active) return;
        setRenewed({ original: asset.path, url: value.url }); setFailed(null);
        timer = setTimeout(refresh, (value.expiresIn - 60) * 1000);
      } catch { if (active) setFailed(asset.path); }
    }
    timer = setTimeout(refresh, 240_000);
    return () => { active = false; clearTimeout(timer); };
  }, [client, asset.path, asset.storage_path]);
  const src = renewed?.original === asset.path ? renewed.url : asset.path;
  return <div>
    <AdMedia {...props} src={src} />
    {failed === asset.path && <p role="alert" className="mt-1 text-xs text-red-700">画像の表示期限を更新できません。再読み込みしてください。</p>}
  </div>;
}
