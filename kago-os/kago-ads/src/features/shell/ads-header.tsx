"use client";
import Link from "next/link";
import { ConnectedAdsHeader, useAdsRuntime } from "@/features/auth/ads-runtime";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { getRepository } from "@/lib/data";
import { parseSessionKey, sessionKey, setSession, useSession } from "@/lib/session";

const LOGINS = [
  { key: "guest", label: "ログインしていない" },
  { key: "store_staff:S1", label: "店舗｜広島デモ店" },
  { key: "store_staff:S2", label: "店舗｜広島デモ店 駅前店" },
  { key: "maker_staff:M1", label: "メーカー｜瀬戸内トマト食品" },
  { key: "maker_staff:M2", label: "メーカー｜確認用メーカー" },
];

export function AdsHeader() {
  const { source } = useAdsRuntime();
  return source === "mock" ? <DemoAdsHeader /> : <ConnectedAdsHeader />;
}

export function DemoAdsHeader() {
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();

  // デモ用：URL の ?as=maker_staff:M1 のような指定でログインを切り替える（役割ごとの画面を直接開くため）
  useEffect(() => {
    const as = new URLSearchParams(window.location.search).get("as");
    if (as && LOGINS.some((l) => l.key === as)) setSession(parseSessionKey(as));
  }, [pathname]);

  const nav =
    session.role === "store_staff"
      ? [
          { href: "/ads/store/calls", label: "自店の募集" },
          { href: "/ads/portal", label: "募集ポータル" },
          { href: "/ads/dev/review", label: "審査（確認用）" },
          { href: "/signage/dev", label: "Signage（確認用）" },
        ]
      : session.role === "maker_staff"
        ? [
            { href: "/ads/portal", label: "募集を探す" },
            { href: "/ads/maker/creatives", label: "自社の広告" },
            { href: "/ads/maker/applications", label: "申請一覧" },
          ]
        : [{ href: "/ads/portal", label: "募集ポータル" }];

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link href="/ads" className="font-bold">
          <span className="text-brand">KAGO</span>/Ads
        </Link>
        <nav className="flex flex-wrap gap-1 text-sm">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-md px-3 py-1.5 ${pathname.startsWith(n.href) ? "bg-orange-50 font-semibold text-brand" : "hover:bg-gray-100"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-xs text-muted">ログイン（デモ）</span>
            <select
              className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm"
              value={sessionKey(session)}
              onChange={(e) => {
                setSession(parseSessionKey(e.target.value));
                router.push("/ads");
              }}
            >
              {LOGINS.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rounded-md px-2 py-1.5 text-xs text-muted hover:bg-gray-100"
            onClick={async () => {
              if (!window.confirm("仮データを最初の状態に戻します。作った募集・広告・申請は消えます。")) return;
              await getRepository().reset();
              window.location.reload();
            }}
          >
            仮データを初期化
          </button>
        </div>
      </div>
    </header>
  );
}
