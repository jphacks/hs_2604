"use client";
// ADS-02：店舗の担当者が自店の募集（ad_calls）を一覧し、公開・終了を切り替える
import Link from "next/link";
import { useState } from "react";
import { useStoreCallsRepository, useStoreSession, useAdsRuntime } from "@/features/auth/ads-runtime";
import { callPhase, periodLabel } from "@/lib/domain/rules";
import type { AdCall, AdCallStatus } from "@/lib/domain/types";
import { ChannelTags, PhaseBadge } from "@/components/badges";
import { Button, ButtonLink, Card, Empty, ErrorList, Loading, NeedRole, PageTitle } from "@/components/parts";
import { errorMessages, useLoad } from "@/lib/use-load";

export function RecruitmentList() {
  const session = useStoreSession();
  const getRepository = useStoreCallsRepository();
  const { source } = useAdsRuntime();
  const { state, reload } = useLoad(
    () => (session.role === "store_staff" ? getRepository().listMyAdCalls(session) : Promise.resolve([])),
    [JSON.stringify(session)],
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [changing, setChanging] = useState(false);

  if (session.role !== "store_staff") return <NeedRole role="店舗の担当者" />;

  const change = async (c: AdCall, status: AdCallStatus) => {
    if (status === "closed" && !window.confirm(`「${c.title}」を終了します。終了後は新しい申請を受け付けず、再公開もできません。承認済みの広告は配信期間まで続きます。`)) return;
    if (changing) return;
    setChanging(true);
    try {
      setErrors([]);
      await getRepository().setAdCallStatus(session, c.id, status, c.updated_at);
      reload();
    } catch (e) {
      setErrors(errorMessages(e));
    } finally { setChanging(false); }
  };

  return (
    <>
      <PageTitle
        title="自店の募集"
        lead="公開した募集は募集ポータルに表示され、メーカーが申請できるようになります。申請の審査は KAGO/Insight で行います。"
        action={<ButtonLink href="/ads/store/calls/new">新しい募集を作る</ButtonLink>}
      />
      <ErrorList errors={errors} />
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <ErrorList errors={[state.error]} />}
      {state.status === "ready" && state.data.length === 0 && <Empty>まだ募集がありません。「新しい募集を作る」から作成してください。</Empty>}
      {state.status === "ready" && state.data.length > 0 && (
        <div className="mt-4 space-y-3">
          {state.data.map((c) => (
            <Card key={c.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <PhaseBadge phase={callPhase(c)} />
                    <ChannelTags channels={c.channels} />
                  </div>
                  <h2 className="mt-2 font-bold">{c.title}</h2>
                  <p className="mt-1 text-sm text-muted">
                    掲載期間 {periodLabel(c.starts_at, c.ends_at)}｜{c.categories.join("・")}｜成果の公開 {c.disclosure_scope.length}項目
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {c.status !== "closed" && (
                    <ButtonLink href={`/ads/store/calls/edit?id=${c.id}`} variant="secondary">
                      編集
                    </ButtonLink>
                  )}
                  {c.status === "draft" && <Button disabled={changing} onClick={() => change(c, "open")}>公開する</Button>}
                  {c.status === "open" && (
                    <>
                      {source === "mock" && <Link href={`/ads/portal/call?id=${c.id}`} className="self-center px-2 text-sm text-brand underline">
                        ポータルで見る
                      </Link>}
                      <Button variant="danger" disabled={changing} onClick={() => change(c, "closed")}>
                        募集を終了
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
