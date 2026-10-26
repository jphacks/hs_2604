"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAdMediaPaths, validateAdImage } from "@kago/backend";
import { useAdsRuntime } from "@/features/auth/ads-runtime";
import { AssetPicker } from "./asset-picker";
import { ConnectedAdMedia } from "./connected-media";
import { Button, ErrorList, Field, inputClass } from "@/components/parts";
import type { CreativeVersionInput } from "@/lib/data/repository";

type Assets=CreativeVersionInput["assets"];
type Asset=NonNullable<Assets["app"]>;
type UpdateAssets=Assets|((current:Assets)=>Assets);
export function CreativeAssetsPicker({value,onChange,makerName,onBlockedChange}:{
 value:Assets;onChange:(value:UpdateAssets)=>void;makerName?:string;onBlockedChange?:(blocked:boolean)=>void;
}){
 const {source,client}=useAdsRuntime();
 const [capability,setCapability]=useState<"loading"|"legacy"|"media"|"error">("loading");
 const blocked=useRef({app:false,signage:false,common:false});
 const updateBlocked=useCallback((key:keyof typeof blocked.current,value:boolean)=>{
  blocked.current[key]=value;onBlockedChange?.(Object.values(blocked.current).some(Boolean));
 },[onBlockedChange]);
 const appBlocked=useCallback((b:boolean)=>updateBlocked("app",b),[updateBlocked]);
 const signageBlocked=useCallback((b:boolean)=>updateBlocked("signage",b),[updateBlocked]);
 const commonBlocked=useCallback((b:boolean)=>updateBlocked("common",b),[updateBlocked]);
 useEffect(()=>{
  if(source!=="supabase"||!client)return;
  let active=true;onBlockedChange?.(true);
  getAdMediaPaths(client,[]).then(result=>{
   if(active){setCapability(result.supported?"media":"legacy");onBlockedChange?.(false);}
  }).catch(()=>{if(active)setCapability("error");});
  return()=>{active=false;onBlockedChange?.(false);};
 },[source,client,onBlockedChange]);
 if(source==="mock")return <>
  <AssetPicker channel="signage" makerName={makerName} value={value.signage} onChange={a=>onChange(current=>({...current,signage:a}))}/>
  <AssetPicker channel="app" makerName={makerName} value={value.app} onChange={a=>onChange(current=>({...current,app:a}))}/>
 </>;
 if(capability==="loading")return <p role="status">画像の登録方法を確認しています…</p>;
 if(capability==="error")return <p role="alert">画像の登録方法を確認できません。接続を確認して画面を開き直してください。</p>;
 if(capability==="legacy")return <ImageInput asset={value.app??value.signage} makerName={makerName}
  onBlockedChange={commonBlocked} onChange={a=>onChange({app:a,signage:a})}/>;
 return <div className="space-y-5">
  <p className="text-sm text-muted">同じ素材の版に、掲載先ごとの画像を登録できます。使う掲載先の画像を選んでください。未登録の掲載先には申請できません。</p>
  <ImageInput channel="app" asset={value.app} makerName={makerName} onBlockedChange={appBlocked} onChange={a=>onChange(current=>({...current,app:a}))}/>
  <ImageInput channel="signage" asset={value.signage} makerName={makerName} onBlockedChange={signageBlocked} onChange={a=>onChange(current=>({...current,signage:a}))}/>
 </div>;
}
function ImageInput({asset,onChange,makerName,onBlockedChange,channel}:{
 asset?:Asset;onChange:(value:Asset)=>void;makerName?:string;onBlockedChange?:(blocked:boolean)=>void;channel?:"app"|"signage";
}){
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
    onBlockedChange?.(failed.current);
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
  }, [onBlockedChange]);

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
      onChange(next);
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
    <Field label={channel==="app"?"App用画像（正方形）":channel==="signage"?"Signage用画像（横長）":"広告画像"} hint={"PNG・JPEG・WebP、各5MiB以下。"+(channel==="app"?"推奨比率1:1。":channel==="signage"?"推奨比率16:9。":"AppとSignageで共通の画像を使います。媒体別登録は準備中です。")}>
      <input type="file" accept="image/png,image/jpeg,image/webp" className={inputClass} disabled={busy}
        onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void choose(file); }}/>
    </Field>
    {asset?.upload && <p className="text-xs text-muted">選択した画像：{asset.file_name}</p>}
    {busy && <p role="status" className="text-sm text-muted">画像を確認中です。完了するまで保存できません。</p>}
    <p className="text-xs text-muted">画像全体が収まるように表示します。価格と「広告｜提供」の表記は画面が重ねます。余白や文字の重なりをプレビューで確認してください。</p>
    <ErrorList errors={errors}/>
    {errors.length > 0 && asset && <Button variant="secondary" onClick={() => {
      if (pending.current) return;
      failed.current = false;
      setErrors([]);
      onBlockedChange?.(false);
    }}>選択前の画像を使う</Button>}
    {asset && <div className="flex flex-wrap items-start gap-4">
      {channel!=="signage"&&<div><p className="mb-1 text-xs">App</p><ConnectedAdMedia asset={asset} channel="app" makerName={makerName} className="w-40"/></div>}
      {channel!=="app"&&<div><p className="mb-1 text-xs">Signage</p><ConnectedAdMedia asset={asset} channel="signage" makerName={makerName} className="w-80 max-w-full"/></div>}
    </div>}
  </div>;
}
