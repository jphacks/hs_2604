"use client";
// ADS-03：申請の詳細（審査の状態・コメント・掲載先ごとの配信・履歴）と再申請
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useMakerRepository, usePortalSession as useSession } from "@/features/auth/ads-runtime";
import type { ApplicationInput } from "@/lib/data/repository";
import {
  canApplyTo,
  canResubmit,
  dateOf,
  dayStart,
  deliveryState,
  latestRevision,
  periodLabel,
  storeLabel,
  today,
} from "@/lib/domain/rules";
import { CHANNEL_LABEL, CHANNELS } from "@/lib/domain/types";
import { DeliveryBadge, StatusBadge } from "@/components/badges";
import { Button, Card, ErrorList, Loading, NeedRole } from "@/components/parts";
import { errorMessages, useLoad } from "@/lib/use-load";
import { ApplicationFields } from "./application-fields";

export function ApplicationDetail() {
  const id = useSearchParams().get("id") ?? "";
  const session = useSession();
  const getRepository = useMakerRepository();
  const { state, reload } = useLoad(async () => {
    if (session.role !== "maker_staff") return null;
    const repo = getRepository();
    const app = await repo.getApplication(session, id);
    if (!app) return { app };
    const [call, stores, creatives, makers, products, placements] = await Promise.all([
      repo.getAdCall(session, app.ad_call_id),
      repo.listStores(),
      repo.listMyCreatives(session),
      repo.listMakers(),
      repo.listProducts(),
      repo.listPlacements(session, app.id),
    ]);
    const item = creatives.find((c) => c.creative.id === app.creative_id);
    return {
      app,
      call,
      store: stores.find((s) => s.id === app.store_id),
      item,
      product: products.find((p) => p.id === item?.creative.product_id),
      makerName: makers.find((m) => m.id === session.makerId)?.display_name,
      placements,
    };
  }, [id, JSON.stringify(session)]);

  const [form, setForm] = useState<ApplicationInput | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  if (session.role !== "maker_staff") return <NeedRole role="メーカー" />;
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorList errors={[state.error]} />;
  const { app, call, store, item, product, makerName, placements } = state.data!;
  if (!app || !call || !store || !item) return <ErrorList errors={["申請が見つからないか、他社の申請です"]} />;

  const latest = latestRevision(app);
  const versionNo = (vid: string) => item.versions.find((v) => v.id === vid)?.version;
  const resubmittable = canResubmit(app) && canApplyTo(call);
  const shownChannels = CHANNELS.filter((ch) => app.channels.includes(ch) || placements.some((p) => p.channels.includes(ch)));

  const startResubmit = () => {
    const newest = item.versions[item.versions.length - 1];
    const todayStart = dayStart(today());
    setForm({
      creative_version_id: newest.id,
      channels: latest.channels.filter((ch) => newest.assets[ch]),
      requested_start: Date.parse(todayStart) > Date.parse(latest.requested_start) ? todayStart : latest.requested_start,
      requested_end: latest.requested_end,
      message: "",
    });
  };

  const resubmit = async () => {
    if (!form || saving) return;
    setSaving(true);
    setErrors([]);
    try {
      await getRepository().resubmitApplication(session, app.id, form, app.updated_at);
      setForm(null);
      reload();
    } catch (e) {
      setErrors(errorMessages(e));
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <Link href="/ads/maker/applications" className="text-sm text-brand underline">
        ← 申請一覧へ戻る
      </Link>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={app.status} />
          <span className="text-xs text-muted">{app.id}</span>
        </div>
        <h1 className="mt-2 text-2xl font-bold">{product?.name}</h1>
        <p className="text-sm text-muted">
          {storeLabel(store)}｜
          <Link href={`/ads/portal/call?id=${call.id}`} className="underline">
            {call.title}
          </Link>
        </p>
        {app.status === "rejected" && app.review_comment && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">却下の理由：{app.review_comment}</p>
        )}
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        {shownChannels.map((ch) => {
          const { state: ds, placement } = deliveryState(placements, ch);
          return (
            <Card key={ch}>
              <div className="flex items-center justify-between">
                <p className="font-bold">{CHANNEL_LABEL[ch]}</p>
                <DeliveryBadge channel={ch} state={ds} />
              </div>
              {placement ? (
                <p className="mt-2 text-sm">
                  配信する版：第{versionNo(placement.creative_version_id)}版（{periodLabel(placement.starts_at, placement.ends_at)}）
                  {placement.status === "suspended" && placement.suspend_reason && (
                    <span className="mt-1 block text-red-700">停止の理由：{placement.suspend_reason}</span>
                  )}
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  {app.status === "approved" && app.channels.includes(ch)
                    ? "店舗はこの掲載先を承認しませんでした（掲載先を絞って承認）。"
                    : "承認された版はありません。"}
                </p>
              )}
              {app.status === "submitted" && placement && (
                <p className="mt-1 text-xs text-muted">新しい申請（{latest.rev}回目）の審査中も、今の版の配信が続きます。</p>
              )}
            </Card>
          );
        })}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">申請の履歴</h2>
          {!form &&
            (resubmittable ? (
              <Button onClick={startResubmit}>{app.status === "approved" ? "素材を差し替えて再申請" : "修正して再申請"}</Button>
            ) : (
              <span className="text-xs text-muted">
                {canApplyTo(call) ? "審査中のため、結果が出るまで再申請できません" : "募集が終了しているため再申請できません"}
              </span>
            ))}
        </div>

        {form && (
          <Card className="space-y-4"><fieldset disabled={saving} className="contents">
            <h3 className="font-bold">{latest.rev + 1}回目の申請</h3>
            <p className="text-sm text-muted">
              素材を変える場合は、先に
              <Link href={`/ads/maker/creative?id=${item.creative.id}`} className="text-brand underline">
                広告素材の詳細
              </Link>
              で新しい版を作ってください。
            </p>
            <ApplicationFields call={call} versions={item.versions} value={form} onChange={setForm} makerName={makerName} />
            <ErrorList errors={errors} />
            <div className="flex gap-2">
              <Button disabled={saving} onClick={resubmit}>再申請する</Button>
              <Button variant="secondary" onClick={() => setForm(null)}>
                やめる
              </Button>
            </div>
          </fieldset></Card>
        )}

        {[...app.revisions].reverse().map((r) => (
          <Card key={r.rev}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{r.rev}回目</span>
              <StatusBadge status={r.status} />
              <span className="text-xs text-muted">
                第{versionNo(r.creative_version_id)}版｜{r.channels.map((ch) => CHANNEL_LABEL[ch]).join("・")}｜希望期間 {periodLabel(r.requested_start, r.requested_end)}｜{dateOf(r.submitted_at)} 申請
              </span>
            </div>
            {r.message && <p className="mt-2 text-sm">メッセージ：{r.message}</p>}
            {r.review_comment && <p className="mt-2 text-sm">店舗のコメント：{r.review_comment}</p>}
          </Card>
        ))}
      </section>
    </div>
  );
}
