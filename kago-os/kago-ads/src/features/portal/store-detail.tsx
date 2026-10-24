"use client";
// ADS-01：店舗の詳細と、その店舗の募集
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { usePortalRepository } from "@/features/auth/ads-runtime";
import { callPhase, canApplyTo, periodLabel, storeLabel } from "@/lib/domain/rules";
import { ChannelTags, PhaseBadge } from "@/components/badges";
import { Card, Empty, ErrorList, Loading } from "@/components/parts";
import { useLoad } from "@/lib/use-load";

export function StoreDetail() {
  const getRepository = usePortalRepository();
  const id = useSearchParams().get("id") ?? "";
  const { state } = useLoad(async () => {
    const repo = getRepository();
    const [stores, calls, devices] = await Promise.all([repo.listStores(), repo.listPublicAdCalls(), repo.listSignageDevices(id)]);
    return {
      store: stores.find((s) => s.id === id),
      devices,
      calls: calls
        .filter((c) => c.store_id === id)
        .sort((a, b) => Number(canApplyTo(b)) - Number(canApplyTo(a)) || b.starts_at.localeCompare(a.starts_at)),
    };
  }, [id]);

  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorList errors={[state.error]} />;
  const { store, devices, calls } = state.data;
  if (!store) return <ErrorList errors={["店舗が見つかりません"]} />;

  return (
    <div className="space-y-6">
      <Link href="/ads/portal/stores" className="text-sm text-brand underline">
        ← 店舗一覧へ戻る
      </Link>
      <Card>
        <h1 className="text-2xl font-bold">{storeLabel(store)}</h1>
        <p className="text-sm text-muted">{store.address}</p>
        <p className="mt-3">{store.description}</p>
        {devices.length > 0 && <p className="mt-2 text-sm text-muted">サイネージの設置場所：{devices.map((d) => d.location).join("・")}</p>}
      </Card>
      <h2 className="font-bold">この店舗の募集</h2>
      {calls.length === 0 ? (
        <Empty>今は公開中の募集がありません。</Empty>
      ) : (
        <div className="space-y-3">
          {calls.map((c) => (
            <Link key={c.id} href={`/ads/portal/call?id=${c.id}`} className="block">
              <Card className="transition hover:border-brand">
                <div className="flex flex-wrap items-center gap-2">
                  <PhaseBadge phase={callPhase(c)} />
                  <ChannelTags channels={c.channels} />
                </div>
                <p className="mt-2 font-bold">{c.title}</p>
                <p className="mt-1 text-xs text-muted">
                  掲載期間 {periodLabel(c.starts_at, c.ends_at)}｜{c.categories.join("・")}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
