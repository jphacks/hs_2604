"use client";

import { useState } from "react";
import { SessionScreen } from "@/features/shopping/session-screen";

export function SessionPreview(){
 const [screen,setScreen]=useState<"login"|"error">("login");
 const [message,setMessage]=useState("");
 return <>
   <div style={{position:"fixed",zIndex:90,top:12,right:12,display:"flex",gap:4,padding:4,borderRadius:18,background:"#ffffffed",boxShadow:"0 2px 12px #0e284112"}}>
     {(["login","error"] as const).map(value=><button key={value} type="button" aria-pressed={screen===value} onClick={()=>{setScreen(value);setMessage("");}} style={{border:0,fontFamily:"inherit",cursor:"pointer",fontSize:11,padding:"7px 10px",borderRadius:15,background:screen===value?"#E6F6F5":"transparent",color:"#07576B"}}>{value==="login"?"ログイン":"接続エラー"}</button>)}
   </div>
   <SessionScreen kind={screen} error={screen==="error"?"接続できませんでした。通信状態を確認して再試行してください。":message||undefined}
     onLogin={event=>{event.preventDefault();setMessage("見た目の確認用です。ログイン情報は送信していません。");}}
     onRetry={()=>setScreen("login")} onLogout={()=>setScreen("login")}/>
 </>;
}
