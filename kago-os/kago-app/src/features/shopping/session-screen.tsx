"use client";

import { AppBrandHeader } from "@/components/app-brand-header";
import { useState,useSyncExternalStore, type FormEvent } from "react";
import { ShoppingIcon } from "@/components/shopping-icons";
import "./session-screen.css";

type Props={
 kind:"login"|"error"|"loading";
 error?:string;
 onLogin?:(event:FormEvent<HTMLFormElement>)=>void;
 onRetry?:()=>void;
 onLogout?:()=>void;
};
const subscribeReady=()=>()=>{};
const readyClient=()=>true,readyServer=()=>false;
export function SessionScreen({kind,error,onLogin,onRetry,onLogout}:Props){
 const interactive=useSyncExternalStore(subscribeReady,readyClient,readyServer);
 const [showPassword,setShowPassword]=useState(false);
 return <main className="session-screen">
   <AppBrandHeader/>
   <div className="session-screen-content">
     <section className={"session-screen-card session-screen-"+kind} aria-labelledby="session-screen-heading">
       <span className={"session-screen-symbol"+(kind==="error"?" session-screen-symbol-error":"")} aria-hidden="true">
         {kind==="error"?<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="m3 3 18 18M2 8.5a17 17 0 0 1 2.5-1.6M8 5.5A17 17 0 0 1 22 8.5M5 12a12 12 0 0 1 3-1.7M12 9.7a12 12 0 0 1 7 2.3M8.5 15.5a6 6 0 0 1 7 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/></svg>:<ShoppingIcon name="cart"/>}
       </span>
       <h1 id="session-screen-heading">{kind==="login"?"お買い物をはじめる":kind==="error"?"お買い物を開けませんでした":"お買い物の準備中です"}</h1>
       {kind==="login"?<>
         <p className="session-screen-lead">ログインして、いつものお店で<br/>かんたん・気軽にお買い物。</p>
         {error&&<p role="alert" className="session-screen-notice">{error}</p>}
         <form method="post" onSubmit={event=>{event.preventDefault();onLogin?.(event);}} className="session-screen-form">
           <label htmlFor="shopping-login-email">メールアドレス</label>
           <input id="shopping-login-email" name="email" type="email" inputMode="email" required maxLength={254} autoComplete="username" placeholder="メールアドレスを入力"/>
           <label htmlFor="shopping-login-password">パスワード</label>
           <div className="session-screen-password">
             <input id="shopping-login-password" name="password" type={showPassword?"text":"password"} required maxLength={1024} autoComplete="current-password" placeholder="パスワードを入力"/>
             <button type="button" aria-label={showPassword?"パスワードを隠す":"パスワードを表示"} aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>{showPassword&&<path d="m3 3 18 18"/>}</svg></button>
           </div>
           <button type="submit" disabled={!interactive} className="session-screen-primary">ログイン<ShoppingIcon name="arrow"/></button>
         </form>
         <p className="session-screen-footnote">ログイン後に、店舗のQRコードを読み取って<br/>お買い物を始められます。</p>
       </>:kind==="error"?<>
         <p role="alert" className="session-screen-error-message">{error?.startsWith("接続できませんでした。")?<><span>接続できませんでした。</span><span>{error.slice("接続できませんでした。".length)}</span></>:error}</p>
         <p className="session-screen-lead">通信状態を確認してから、もう一度お試しください。</p>
         <button type="button" onClick={onRetry} className="session-screen-primary">再試行<ShoppingIcon name="arrow"/></button>
         <button type="button" onClick={onLogout} className="session-screen-secondary">別のアカウントでログイン</button>
       </>:<><span className="session-screen-spinner" aria-hidden="true"/><p role="status" className="session-screen-lead">ログインと買い物の状態を確認しています…</p></>}
     </section>
   </div>
 </main>;
}
