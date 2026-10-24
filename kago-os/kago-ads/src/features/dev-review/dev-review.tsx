"use client";
// INS-01・DB-08 ができるまでの確認用。ADS-03 の「審査結果の表示・再申請」を試すために使う
// 本番の審査は KAGO/Insight で行う。この画面は Insight ができたら削除する
import { useState } from "react";
import { getRepository } from "@/lib/data";
import { dateOf, dayEnd, dayStart, latestRevision, storeLabel } from "@/lib/domain/rules";
import { CHANNEL_LABEL, type AdApplication, type AdPlacement, type Channel } from "@/lib/domain/types";
import { useSession } from "@/lib/session";
import { StatusBadge } from "@/components/badges";
import { Button, Card, Empty, ErrorList, inputClass, Loading, NeedRole, PageTitle } from "@/components/parts";
import { errorMessages, useLoad } from "@/lib/use-load";

export function DevReview() {
  const session = useSession();
  const { state, reload } = useLoad(async () => {
    if (session.role !== "store_staff") return null;
    const repo = getRepository();
    const [applications, calls, makers, stores] = await Promise.all([
      repo.devListStoreApplications(session),
      repo.listPublicAdCalls(),
      repo.listMakers(),
      repo.listStores(),
    ]);
    const placements = Object.fromEntries(
      await Promise.all(applications.map(async (a) => [a.id, await repo.listPlacements(session, a.id)] as const)),
    );
    return { applications, calls, makers, store: stores.find((s) => s.id === session.storeId), placements };
  }, [JSON.stringify(session)]);
  const [errors, setErrors] = useState<string[]>([]);

  if (session.role !== "store_staff") return <NeedRole role="店舗の担当者" />;

  const run = async (fn: () => Promise<unknown>) => {
    setErrors([]);
    try {
      await fn();
      reload();
    } catch (e) {
      setErrors(errorMessages(e));
    }
  };

  return (
    <>
      <PageTitle
        title="審査（確認用）"
        lead="INS-01（KAGO/Insight の審査画面）と DB-08 ができるまで、ADS-03 の動きを確かめるための仮の画面です。本番の審査は Insight で行います。"
      />
      <ErrorList errors={errors} />
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <ErrorList errors={[state.error]} />}
      {state.status === "ready" && state.data && state.data.applications.length === 0 && <Empty>この店舗への申請はありません。</Empty>}
      {state.status === "ready" && state.data && (
        <div className="space-y-3">
          <p className="text-sm text-muted">{state.data.store && storeLabel(state.data.store)}</p>
          {state.data.applications.map((a) => (
            <ReviewCard
              key={a.id}
              app={a}
              callTitle={state.data!.calls.find((c) => c.id === a.ad_call_id)?.title ?? ""}
              makerName={state.data!.makers.find((m) => m.id === a.maker_id)?.display_name ?? ""}
              placements={state.data!.placements[a.id]}
              onApprove={(channels, start, end) =>
                run(() => getRepository().devApprove(session, a.id, { channels, starts_at: dayStart(start), ends_at: dayEnd(end) }))
              }
              onReject={(comment) => run(() => getRepository().devReject(session, a.id, comment))}
              onSuspend={(placementId, reason) => run(() => getRepository().devSuspend(session, placementId, reason))}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ReviewCard({
  app,
  callTitle,
  makerName,
  placements,
  onApprove,
  onReject,
  onSuspend,
}: {
  app: AdApplication;
  callTitle: string;
  makerName: string;
  placements: AdPlacement[];
  onApprove: (channels: Channel[], start: string, end: string) => void;
  onReject: (comment: string) => void;
  onSuspend: (placementId: string, reason: string) => void;
}) {
  const rev = latestRevision(app);
  // 承認時に絞れる掲載先と配信期間（初期値は申請どおり）
  const [channels, setChannels] = useState<Channel[]>(app.channels);
  const [start, setStart] = useState(dateOf(app.requested_start));
  const [end, setEnd] = useState(dateOf(app.requested_end));
  const [comment, setComment] = useState("");
  const active = placements.filter((p) => p.status === "active");

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={app.status} />
        <span className="text-sm font-semibold">{app.id}</span>
        <span className="text-xs text-muted">
          {makerName}｜{callTitle}｜{rev.rev}回目｜申請：{app.channels.map((c) => CHANNEL_LABEL[c]).join("・")}
        </span>
      </div>

      {app.status === "submitted" && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-xs text-muted">承認する掲載先</span>
            {app.channels.map((c) => (
              <label key={c} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={channels.includes(c)}
                  onChange={() => setChannels(channels.includes(c) ? channels.filter((x) => x !== c) : [...channels, c])}
                />
                {CHANNEL_LABEL[c]}
              </label>
            ))}
            <input type="date" className={`${inputClass} w-auto`} value={start} onChange={(e) => setStart(e.target.value)} aria-label="配信開始" />
            <input type="date" className={`${inputClass} w-auto`} value={end} onChange={(e) => setEnd(e.target.value)} aria-label="配信終了" />
            <Button onClick={() => onApprove(channels, start, end)}>承認</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${inputClass} max-w-md`} placeholder="却下の理由（必須・200字以内）" value={comment} onChange={(e) => setComment(e.target.value)} />
            <Button variant="secondary" onClick={() => onReject(comment)}>
              却下
            </Button>
          </div>
        </div>
      )}

      {active.map((p) => (
        <div key={p.id} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span>
            配信中：{p.id}（{p.channels.map((c) => CHANNEL_LABEL[c]).join("・")}）
          </span>
          <input className={`${inputClass} max-w-xs`} placeholder="停止の理由（必須）" value={comment} onChange={(e) => setComment(e.target.value)} />
          <Button variant="danger" onClick={() => onSuspend(p.id, comment)}>
            停止
          </Button>
        </div>
      ))}
    </Card>
  );
}
