"use client";
// ADS-01：募集の詳細（募集条件・公開される成果・店舗情報）から申請へ進む
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { usePortalRepository, usePortalSession } from "@/features/auth/ads-runtime";
import { canApplyTo, callPhase, periodLabel, storeLabel } from "@/lib/domain/rules";
import { CHANNEL_LABEL, DISCLOSURE_LABEL } from "@/lib/domain/types";
import { ChannelTags, PhaseBadge } from "@/components/badges";
import { ButtonLink, Card, ErrorList, Loading } from "@/components/parts";
import { useLoad } from "@/lib/use-load";

export function RecruitmentDetail() {
  const getRepository = usePortalRepository();
  const id = useSearchParams().get("id") ?? "";
  const session = usePortalSession();
  const { state } = useLoad(async () => {
    const repo = getRepository();
    const call = await repo.getAdCall(session, id);
    const [stores, devices, myApplications] = await Promise.all([
      repo.listStores(),
      call ? repo.listSignageDevices(call.store_id) : Promise.resolve([]),
      session.role === "maker_staff" ? repo.listMyApplications(session) : Promise.resolve([]),
    ]);
    return {
      call,
      store: stores.find((s) => s.id === call?.store_id),
      devices,
      applied: myApplications.filter((a) => a.ad_call_id === id),
    };
  }, [id, JSON.stringify(session)]);

  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorList errors={[state.error]} />;
  const { call: c, store, devices, applied } = state.data;
  if (!c || !store) return <ErrorList errors={["募集が見つかりません（下書き、または削除された募集です）"]} />;

  const applicable = canApplyTo(c);
  const phase = callPhase(c);

  return (
    <div className="space-y-6">
      <Link href="/ads/portal" className="text-sm text-brand underline">
        ← 募集ポータルへ戻る
      </Link>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <PhaseBadge phase={phase} />
          <ChannelTags channels={c.channels} />
        </div>
        <h1 className="mt-2 text-2xl font-bold">{c.title}</h1>
        <p className="mt-1 text-sm text-muted">{storeLabel(store)}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="space-y-4">
          <h2 className="font-bold">募集条件</h2>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted">掲載期間</dt>
            <dd>{periodLabel(c.starts_at, c.ends_at)}</dd>
            <dt className="text-muted">掲載先</dt>
            <dd>{c.channels.map((ch) => CHANNEL_LABEL[ch]).join("・")}</dd>
            <dt className="text-muted">対象カテゴリ</dt>
            <dd>{c.categories.join("・")}</dd>
            <dt className="text-muted">素材の仕様</dt>
            <dd>
              {c.channels.includes("signage") && <p>Signage：1920×1080 の画像（2MB以下）、または MP4 動画（15秒以内・20MB以下）</p>}
              {c.channels.includes("app") && <p>App：800×800 の画像（2MB以下）</p>}
              <p className="text-xs text-muted">価格と「広告｜提供」の表記は画面側で重ねるので、素材には入れないでください。</p>
            </dd>
            <dt className="text-muted">公開される成果</dt>
            <dd>
              {c.disclosure_scope.length === 0 ? (
                <p>この募集では、成果をメーカーに公開しません。</p>
              ) : (
                <ul className="list-disc pl-5">
                  {c.disclosure_scope.map((m) => (
                    <li key={m}>{DISCLOSURE_LABEL[m]}</li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted">承認された自社広告の集計だけが見られます。個人の購買明細は見られません。</p>
            </dd>
          </dl>
          <div>
            <h3 className="text-sm font-semibold">案内文</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm">{c.description}</p>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="font-bold">店舗</h2>
            <p className="mt-2 font-semibold">{storeLabel(store)}</p>
            <p className="text-sm text-muted">{store.address}</p>
            <p className="mt-2 text-sm">{store.description}</p>
            {devices.length > 0 && (
              <p className="mt-2 text-xs text-muted">サイネージの設置場所：{devices.map((d) => d.location).join("・")}</p>
            )}
            <Link href={`/ads/portal/store?id=${store.id}`} className="mt-2 inline-block text-sm text-brand underline">
              この店舗の募集をすべて見る
            </Link>
          </Card>

          <Card>
            {!applicable ? (
              <p className="text-sm text-muted">この募集は{phase === "closed" ? "終了して" : "期間が終わって"}いるため、新しい申請は受け付けていません。</p>
            ) : session.role === "maker_staff" ? (
              <div className="space-y-3">
                <ButtonLink href={`/ads/maker/applications/new?call=${c.id}`}>この募集に申請する</ButtonLink>
                {applied.length > 0 && (
                  <p className="text-xs text-muted">
                    この募集には申請済みの広告素材があります（
                    {applied.map((a, i) => (
                      <span key={a.id}>
                        {i > 0 && "、"}
                        <Link className="text-brand underline" href={`/ads/maker/application?id=${a.id}`}>
                          {a.id}
                        </Link>
                      </span>
                    ))}
                    ）。同じ素材の修正は申請の詳細から再申請してください。
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">申請するにはメーカーとしてログインしてください。</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
