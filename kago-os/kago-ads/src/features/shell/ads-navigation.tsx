"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import type {ReactNode} from "react";

export type AdsNavItem={href:string;label:string};
export function AdsIcon({name}:{name:"search"|"image"|"send"|"chart"|"store"|"arrow"|"check"}){
 const paths={search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></>,image:<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/></>,send:<><path d="m21 3-7 18-4-7-7-4 18-7Z"/><path d="m10 14 6-6"/></>,chart:<><path d="M4 3v17h17"/><path d="m8 14 4-4 4 2 5-7"/></>,store:<><path d="M3 9h18l-2-6H5L3 9Z"/><path d="M4 10v11h16V10M9 21v-7h6v7M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/></>,arrow:<path d="m9 5 7 7-7 7"/>,check:<><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></>};
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function navIcon(href:string){return href.includes("results")?"chart":href.includes("creativ")?"image":href.includes("application")?"send":href.includes("stores")||href.includes("/store/")?"store":"search";}
export function AdsTopbar({nav,account,children}:{nav:AdsNavItem[];account:string;children?:ReactNode}){
 const path=usePathname();
 return <header className="ads-header">
  <div className="ads-topbar"><div className="ads-topbar-inner">
   <Link href="/ads" className="ads-wordmark" aria-label="KAGO/Ads ホーム">KAGO<span>/</span>Ads</Link>
   <span className="ads-service-name">広告管理</span>
   <div className="ads-account"><span className="ads-role">{account}</span>{children}</div>
  </div></div>
  <div className="ads-nav-row"><nav aria-label="メインナビゲーション" className="ads-nav">
   <Link href="/ads" aria-current={path==="/ads"?"page":undefined}>ホーム</Link>
   {nav.map(n=>{const active=n.href==="/ads/portal"?path==="/ads/portal"||path==="/ads/portal/call":path.startsWith(n.href.replace(/creatives$/,"creativ").replace(/applications$/,"application"));
    return <Link key={n.href} href={n.href} aria-current={active?"page":undefined}><AdsIcon name={navIcon(n.href)}/>{n.label}</Link>;})}
  </nav></div>
 </header>;
}
