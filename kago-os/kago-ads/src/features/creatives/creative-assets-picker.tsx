"use client";
import { useEffect, useRef, useState } from "react";
import { validateAdImage } from "@kago/backend";
import { useAdsRuntime } from "@/features/auth/ads-runtime";
import { AssetPicker } from "./asset-picker";
import { ConnectedAdMedia } from "./connected-media";
import { ErrorList, Field, inputClass } from "@/components/parts";
import type { CreativeVersionInput } from "@/lib/data/repository";

export function CreativeAssetsPicker({ value, onChange, makerName }: {
  value: CreativeVersionInput["assets"]; onChange: (value: CreativeVersionInput["assets"]) => void; makerName?: string;
}) {
  const { source } = useAdsRuntime();
  const [errors,setErrors]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const objectUrl=useRef<string|null>(null);
  useEffect(()=>()=>{if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);},[]);
  if(source==="mock")return <>
    <AssetPicker channel="signage" makerName={makerName} value={value.signage} onChange={a=>onChange({...value,signage:a})}/>
    <AssetPicker channel="app" makerName={makerName} value={value.app} onChange={a=>onChange({...value,app:a})}/>
  </>;
  const asset=value.app??value.signage;
  async function choose(file?:File) {
    if(!file || busy)return;
    setBusy(true);setErrors([]);
    const url=URL.createObjectURL(file);
    try{
      await validateAdImage(file);
      const image=new Image();image.src=url;await image.decode();
      if(!image.naturalWidth || !image.naturalHeight)throw new Error();
      if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);
      objectUrl.current=url;
      const next={kind:"image" as const,path:url,width:image.naturalWidth,height:image.naturalHeight,bytes:file.size,file_name:file.name,upload:file};
      onChange({app:next,signage:next});
    }catch{URL.revokeObjectURL(url);setErrors(["PNG・JPEG・WebPの正常な画像を5MiB以下で選んでください。動画は登録できません。"]);}
    finally{setBusy(false);}
  }
  return <div className="space-y-3">
    <Field label="広告画像" hint="1つの版に画像1枚。PNG・JPEG・WebP、5MiB以下。AppとSignageで共通の画像を使います。">
      <input type="file" accept="image/png,image/jpeg,image/webp" className={inputClass} disabled={busy}
        onChange={e=>{const f=e.target.files?.[0];e.target.value="";void choose(f);}}/>
    </Field>
    <p className="text-xs text-muted">画像全体が収まるように表示します。価格と「広告｜提供」の表記は画面が重ねます。余白や文字の重なりを両方のプレビューで確認してください。</p>
    <ErrorList errors={errors}/>
    {asset && <div className="flex flex-wrap items-start gap-4">
      <div><p className="mb-1 text-xs">App</p><ConnectedAdMedia asset={asset} channel="app" makerName={makerName} className="w-40"/></div>
      <div><p className="mb-1 text-xs">Signage</p><ConnectedAdMedia asset={asset} channel="signage" makerName={makerName} className="w-80 max-w-full"/></div>
    </div>}
  </div>;
}
