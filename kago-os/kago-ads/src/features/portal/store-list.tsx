"use client";
// ADS-01：店舗一覧
import Link from "next/link";
import { usePortalRepository } from "@/features/auth/ads-runtime";
import { canApplyTo, storeLabel } from "@/lib/domain/rules";
import { Card, ErrorList, Loading, PageTitle } from "@/components/parts";
import { useLoad } from "@/lib/use-load";

export function StoreList() {
  const getRepository = usePortalRepository();
  const { state } = useLoad(async () => {
    const repo = getRepository();
    const [stores, calls] = await Promise.all([repo.listStores(), repo.listPublicAdCalls()]);
    return { stores, calls };
  }, []);

  return (
    <>
      <PageTitle title="店舗一覧" lead="広告を募集している店舗です。店舗ごとの募集を確認できます。" />
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <ErrorList errors={[state.error]} />}
      {state.status === "ready" && (
        <div className="grid gap-4 md:grid-cols-2">
          {state.data.stores.map((s) => {
            const open = state.data.calls.filter((c) => c.store_id === s.id && canApplyTo(c)).length;
            return (
              <Link key={s.id} href={`/ads/portal/store?id=${s.id}`}>
                <Card className="h-full transition hover:border-brand">
                  <p className="font-bold">{storeLabel(s)}</p>
                  <p className="text-sm text-muted">{s.address}</p>
                  <p className="mt-2 text-sm">{s.description}</p>
                  <p className="mt-3 text-sm font-semibold text-brand">申請できる募集 {open}件</p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
