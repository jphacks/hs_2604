"use client";
// ADS-03：自社の広告素材（creatives）と版の一覧
import Link from "next/link";
import { getRepository } from "@/lib/data";
import { CHANNELS } from "@/lib/domain/types";
import { useSession } from "@/lib/session";
import { AdMedia } from "@/components/ad-media";
import { ButtonLink, Card, Empty, ErrorList, Loading, NeedRole, PageTitle } from "@/components/parts";
import { useLoad } from "@/lib/use-load";

export function AdList() {
  const session = useSession();
  const { state } = useLoad(async () => {
    if (session.role !== "maker_staff") return null;
    const repo = getRepository();
    const [creatives, products] = await Promise.all([repo.listMyCreatives(session), repo.listProducts()]);
    return { creatives, products };
  }, [JSON.stringify(session)]);

  if (session.role !== "maker_staff") return <NeedRole role="メーカー" />;

  return (
    <>
      <PageTitle
        title="自社の広告素材"
        lead="広告素材は店舗をまたいで使えます。素材を変えるときは新しい版を作り、申請の詳細から再申請します。"
        action={<ButtonLink href="/ads/maker/creatives/new">新しい広告素材を登録</ButtonLink>}
      />
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <ErrorList errors={[state.error]} />}
      {state.status === "ready" && state.data && state.data.creatives.length === 0 && <Empty>まだ広告素材がありません。</Empty>}
      {state.status === "ready" && state.data && (
        <div className="grid gap-4 md:grid-cols-2">
          {state.data.creatives.map(({ creative, versions }) => {
            const latest = versions[versions.length - 1];
            const product = state.data!.products.find((p) => p.id === creative.product_id);
            return (
              <Link key={creative.id} href={`/ads/maker/creative?id=${creative.id}`}>
                <Card className="h-full transition hover:border-brand">
                  <p className="text-xs text-muted">
                    {creative.id}・最新 第{latest.version}版（全{versions.length}版）
                  </p>
                  <p className="mt-1 font-bold">{product?.name}</p>
                  <p className="text-sm text-muted">{latest.headline}</p>
                  <div className="mt-3 flex items-start gap-3">
                    {CHANNELS.map((ch) =>
                      latest.assets[ch] ? <AdMedia key={ch} asset={latest.assets[ch]!} channel={ch} className={ch === "app" ? "w-24" : "w-44"} /> : null,
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
