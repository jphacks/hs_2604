"use client";

import Image from "next/image";
import "@/components/app-brand-header.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { ShoppingIcon } from "@/components/shopping-icons";
import { useShoppingSession } from "./session-provider";
import "@/app/App/shopping-home.css";
import "@/app/App/account/account.css";

export function AccountShell({active,children}:{active:"history"|"account";children:ReactNode}){
  const session=useShoppingSession();
  const store=session.stores.find(item=>item.id===session.visit?.store_id);
  return <main className="shopping-home shopping-account">
    <header className="shopping-header app-brand-header">
      <Link href="/App" aria-label="KAGO/App ホーム"><Image src="/brand/light/logo-kago-app.png" alt="KAGO/App" width={2124} height={384} className="shopping-logo app-brand-logo" priority/></Link>
      <div className="shopping-store"><span>ご利用店舗</span><strong>{[store?.name,store?.branch_name].filter(Boolean).join(" ")}</strong></div>
    </header>
    <div className="shopping-account-content">{children}</div>
    <nav className="shopping-nav" aria-label="買い物ナビ"><div>
      <Link href="/App/history" aria-current={active==="history"?"page":undefined}><span><ShoppingIcon name="history"/></span>りれき</Link>
      <Link href="/App"><span><ShoppingIcon name="home"/></span>ホーム</Link>
      <Link href="/App/account" aria-current={active==="account"?"page":undefined}><span><ShoppingIcon name="user"/></span>マイページ</Link>
    </div></nav>
  </main>;
}
