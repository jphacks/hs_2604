import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/logo-kago-insight-white.png";
import { signOutAction } from "@/lib/auth-actions";
import { isDemoAutoSignInEnabled } from "@/lib/demo";
import { getStoreSession } from "@/lib/store";
import { Nav } from "@/components/nav";

/**
 * ヘッダー。ログイン中だけ所属店舗名を出す。
 * 店舗名は store_members から解決した自店舗であって、固定値ではない。
 */
export async function SiteHeader() {
  const session = await getStoreSession().catch(() => null);
  const demo = isDemoAutoSignInEnabled();

  return (
    <>
      <header className="insight-header px-4 py-5 text-white sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-3">
          <Link href="/promotions" aria-label="KAGO/Insight 販促設定へ" className="mr-auto block w-[210px] shrink-0 sm:w-[290px]">
            <Image src={logo} alt="KAGO/Insight" className="h-auto w-full" preload unoptimized />
          </Link>
          {session ? (
            <>
              <span className="text-sm font-bold text-white/90">
                {session.store.name}
                {session.store.branchName ? ` ${session.store.branchName}` : ""}
              </span>
              {demo ? (
                <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900">
                  デモ用アカウントで表示中
                </span>
              ) : null}
              <form action={signOutAction} className="shrink-0">
                <button
                  type="submit"
                  className="rounded border border-white/40 px-2 py-1 text-xs hover:bg-white/10"
                >
                  ログアウト
                </button>
              </form>
            </>
          ) : (
            <span className="text-sm font-bold text-white/90">店舗向け管理画面</span>
          )}
        </div>
      </header>
      {/* 未ログインでもタブは出す。/coupons はログイン不要で開けるため。 */}
      <Nav />
    </>
  );
}
