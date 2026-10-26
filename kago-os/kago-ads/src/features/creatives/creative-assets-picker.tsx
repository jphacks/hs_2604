"use client";
import { useEffect, useRef, useState } from "react";
import { validateAdImage } from "@kago/backend";
import { useAdsRuntime } from "@/features/auth/ads-runtime";
import { AssetPicker } from "./asset-picker";
import { ConnectedAdMedia } from "./connected-media";
import { Button, ErrorList, Field, inputClass } from "@/components/parts";
import type { CreativeVersionInput } from "@/lib/data/repository";

export function CreativeAssetsPicker({ value, onChange, makerName, onBlockedChange }: {
  value: CreativeVersionInput["assets"];
  onChange: (value: CreativeVersionInput["assets"]) => void;
  makerName?: string;
  onBlockedChange?: (blocked: boolean) => void;
}) {
  const { source } = useAdsRuntime();
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const objectUrl = useRef<string | null>(null);
  const urls = useRef(new Set<string>());
  const generation = useRef(0);
  const pending = useRef(false);
  const mounted = useRef(true);
  const failed = useRef(false);
  useEffect(() => {
    mounted.current = true;
    onBlockedChange?.(source === "supabase" && failed.current);
    const owned = urls.current;
    return () => {
      mounted.current = false;
      generation.current += 1;
      pending.current = false;
      owned.forEach(url => URL.revokeObjectURL(url));
      owned.clear();
      objectUrl.current = null;
      setBusy(false);
      onBlockedChange?.(false);
    };
  }, [source, onBlockedChange]);

  if (source === "mock") return <>
    <AssetPicker channel="signage" makerName={makerName} value={value.signage} onChange={a => onChange({ ...value, signage: a })}/>
    <AssetPicker channel="app" makerName={makerName} value={value.app} onChange={a => onChange({ ...value, app: a })}/>
  </>;
  const asset = value.app ?? value.signage;
  function revoke(url: string) {
    if (urls.current.delete(url)) URL.revokeObjectURL(url);
  }
  async function choose(file?: File) {
    if (!file || pending.current || !mounted.current) return;
    pending.current = true;
    const request = ++generation.current;
    const current = () => mounted.current && request === generation.current;
    failed.current = false;
    setBusy(true);
    setErrors([]);
    onBlockedChange?.(true);
    let url: string | undefined;
    try {
      await validateAdImage(file);
      if (!current()) return;
      url = URL.createObjectURL(file);
      urls.current.add(url);
      const image = new Image();
      image.src = url;
      await image.decode();
      if (!current()) return;
      if (!image.naturalWidth || !image.naturalHeight) throw new Error();
      if (objectUrl.current) revoke(objectUrl.current);
      objectUrl.current = url;
      const next = { kind: "image" as const, path: url, width: image.naturalWidth, height: image.naturalHeight,
        bytes: file.size, file_name: file.name, upload: file };
      onChange({ app: next, signage: next });
      onBlockedChange?.(false);
    } catch {
      if (current()) {
        failed.current = true;
        setErrors(["PNG・JPEG・WebPの正常な画像を5MiB以下で選んでください。動画は登録できません。画像を確認できるまで保存できません。"]);
        onBlockedChange?.(true);
      }
    } finally {
      if (url && url !== objectUrl.current) revoke(url);
      if (current()) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  return <div className="space-y-3">
    <Field label="広告画像" hint="1つの版に画像1枚。PNG・JPEG・WebP、5MiB以下。AppとSignageで共通の画像を使います。">
      <input type="file" accept="image/png,image/jpeg,image/webp" className={inputClass} disabled={busy}
        onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void choose(file); }}/>
    </Field>
    {busy && <p role="status" className="text-sm text-muted">画像を確認中です。完了するまで保存できません。</p>}
    <p className="text-xs text-muted">画像全体が収まるように表示します。価格と「広告｜提供」の表記は画面が重ねます。余白や文字の重なりを両方のプレビューで確認してください。</p>
    <ErrorList errors={errors}/>
    {errors.length > 0 && asset && <Button variant="secondary" onClick={() => {
      if (pending.current) return;
      failed.current = false;
      setErrors([]);
      onBlockedChange?.(false);
    }}>選択前の画像を使う</Button>}
    {asset && <div className="flex flex-wrap items-start gap-4">
      <div><p className="mb-1 text-xs">App</p><ConnectedAdMedia asset={asset} channel="app" makerName={makerName} className="w-40"/></div>
      <div><p className="mb-1 text-xs">Signage</p><ConnectedAdMedia asset={asset} channel="signage" makerName={makerName} className="w-80 max-w-full"/></div>
    </div>}
  </div>;
}
