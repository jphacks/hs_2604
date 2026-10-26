"use client";
import Image from "next/image";
import {useEffect,useState,type ReactNode} from "react";
import {getAdImageUrl,getAdMediaPaths} from "@kago/backend";
import {createBrowserBackendClient} from "@/lib/backend/browser";

/** Display the approved version's App image; signed URLs stay in memory and refresh before expiry. */
export function SponsoredArtwork({versionId,fallback,sizes}:{versionId:string;fallback:ReactNode;sizes:string}){
 const [image,setImage]=useState<{id:string;url:string|null}>({id:"",url:null});
 useEffect(()=>{
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(versionId))return;
  let active=true;let timer:ReturnType<typeof setTimeout>|undefined;
  const load=async()=>{
   try{
    const client=createBrowserBackendClient();
    const {data,error}=await client.from("creative_versions").select("id,image_path").eq("id",versionId).maybeSingle();
    if(error)throw error;
    const paths=data?(await getAdMediaPaths(client,[data],["app"])).paths.get(versionId):undefined;
    const url=paths?.app?(await getAdImageUrl(client,paths.app)).url:null;
    if(active)setImage({id:versionId,url});
   }catch{if(active)setImage({id:versionId,url:null});}
   if(active)timer=setTimeout(()=>void load(),240000);
  };
  void load();
  return()=>{active=false;clearTimeout(timer);};
 },[versionId]);
 const url=image.id===versionId?image.url:null;
 return url?<Image src={url} alt="" fill sizes={sizes} unoptimized className="object-contain" style={{objectFit:"contain"}}
  onError={()=>setImage({id:versionId,url:null})}/>:fallback;
}
