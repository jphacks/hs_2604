"use client";
// ADS-03：自社の申請と、審査の状態・掲載先ごとの配信の状態
import Link from "next/link";
import { useMakerRepository, usePortalSession as useSession } from "@/features/auth/ads-runtime";
import { deliveryState, storeLabel } from "@/lib/domain/rules";
import { CHANNELS } from "@/lib/domain/types";
import { DeliveryBadge, StatusBadge } from "@/components/badges";
import { ButtonLink, Card, Empty, ErrorList, Loading, NeedRole, PageTitle } from "@/components/parts";
import { useLoad } from "@/lib/use-load";

export function ApplicationList() {
  const session = useSession();
  const getRepository = useMakerRepository();
  const { state } = useLoad(async () => {
    if (session.role !== "maker_staff") return null;
    const repo = getRepository();
    const [applications, calls, stores, products, creatives] = await Promise.all([
      repo.listMyApplications(session),
      repo.listPublicAdCalls(),
      repo.listStores(),
      repo.listProducts(),
      repo.listMyCreatives(session),
    ]);
    const placements = Object.fromEntries(
      await Promise.all(applications.map(async (a) => [a.id, await repo.listPlacements(session, a.id)] as const)),
    );
    return { applications, calls, stores, products, creatives, placements };
  }, [JSON.stringify(session)]);

  if (session.role !== "maker_staff") return <NeedRole role="メーカー" />;

  return (
    <>
      <PageTitle
        title="申請一覧"
        lead="審査は店舗が行い、承認するときに掲載先（App／Signage）を絞ることがあります。却下された申請は、新しい版で再申請できます。"
        action={<ButtonLink href="/ads/portal">募集を探す</ButtonLink>}
      />
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <ErrorList errors={[state.error]} />}
      {state.status === "ready" && state.data && state.data.applications.length === 0 && <Empty>まだ申請していません。募集ポータルから申請できます。</Empty>}
      {state.status === "ready" && state.data && (
        <div className="space-y-3">
          {state.data.applications.map((a) => {
            const d = state.data!;
            const call = d.calls.find((c) => c.id === a.ad_call_id);
            const store = d.stores.find((s) => s.id === a.store_id);
            const creative = d.creatives.find((c) => c.creative.id === a.creative_id)?.creative;
            const product = d.products.find((p) => p.id === creative?.product_id);
            return (
              <Link key={a.id} href={`/ads/maker/application?id=${a.id}`} className="block">
                <Card className="transition hover:border-brand">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={a.status} />
                    {CHANNELS.filter((ch) => a.channels.includes(ch) || d.placements[a.id].some((p) => p.channels.includes(ch))).map((ch) => (
                      <DeliveryBadge key={ch} channel={ch} state={deliveryState(d.placements[a.id], ch).state} />
                    ))}
                    {a.revisions.length > 1 && <span className="text-xs text-muted">{a.revisions.length}回目の申請</span>}
                  </div>
                  <p className="mt-2 font-bold">{product?.name}</p>
                  <p className="text-sm text-muted">
                    {store && storeLabel(store)}｜{call?.title}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
