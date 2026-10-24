import { signOutAction } from "@/lib/auth-actions";
import { getStoreSession } from "@/lib/store";
import { Nav } from "@/components/nav";

/**
 * ヘッダー。ログイン中だけ店舗名とタブを出す。
 * 店舗名は store_members から解決した自店舗であって、固定値ではない。
 */
export async function SiteHeader() {
  const session = await getStoreSession().catch(() => null);

  return (
    <>
      <header className="bg-[var(--accent)] px-4 py-3 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-baseline gap-3">
          <span className="text-lg font-bold">KAGO/Insight</span>
          {session ? (
            <>
              <span className="text-sm opacity-80">
                {session.store.name}
                {session.store.branchName ? ` ${session.store.branchName}` : ""}
              </span>
              <form action={signOutAction} className="ml-auto">
                <button
                  type="submit"
                  className="rounded border border-white/40 px-2 py-1 text-xs hover:bg-white/10"
                >
                  ログアウト
                </button>
              </form>
            </>
          ) : (
            <span className="text-sm opacity-80">店舗向け管理画面</span>
          )}
        </div>
      </header>
      {/* 未ログインでもタブは出す。/coupons はログイン不要で開けるため。 */}
      <Nav />
    </>
  );
}
