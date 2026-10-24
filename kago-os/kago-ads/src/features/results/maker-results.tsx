"use client";
// ADS-04：メーカー向けの成果画面。自社広告の、店舗が公開を許可した集計だけを表示する（DB-09）
// 状態の区別は共通仕様書 9.4（0件・少数・未計測・非公開・事前投入／疑似）
import { useState, type ReactNode } from "react";
import { ChannelTags } from "@/components/badges";
import { Badge, Card, Empty, ErrorList, Field, inputClass, Loading, NeedRole, PageTitle, type Tone } from "@/components/parts";
import { useAdsRuntime, usePortalSession } from "@/features/auth/ads-runtime";
import { createSupabaseResultsRepository } from "@/lib/backend/results";
import { getRepository } from "@/lib/data";
import { addDays, dayEnd, dayStart, periodLabel, today } from "@/lib/domain/rules";
import { DISCLOSURE_LABEL } from "@/lib/domain/types";
import { createMockResultsRepository } from "@/lib/results/mock-results";
import {
  ORIGIN_LABEL,
  rate,
  summarizeApp,
  summarizeSignage,
  type AppSummary,
  type MetricValue,
  type ResultPlacement,
  type SignageSummary,
} from "@/lib/results/results";
import { useLoad } from "@/lib/use-load";

const PLACEMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: "配信中", tone: "green" },
  suspended: { label: "停止中", tone: "red" },
  superseded: { label: "新しい版に置き換え済み", tone: "gray" },
  expired: { label: "配信期間終了", tone: "gray" },
};

export function MakerResults() {
  const session = usePortalSession();
  const { source, client } = useAdsRuntime();
  const [range, setRange] = useState(() => ({ from: addDays(today(), -30), to: today() }));
  const [storeId, setStoreId] = useState("");
  const queryKey = JSON.stringify([session, range, source]);
  const { state } = useLoad(async () => {
    if (session.role !== "maker_staff") return null;
    if (!range.from || !range.to || range.from > range.to) throw new Error("期間の終わりは始まり以降にしてください");
    const repo = source === "mock" ? createMockResultsRepository(getRepository()) : client ? createSupabaseResultsRepository(client) : null;
    if (!repo) throw new Error("接続の設定を確認してください");
    return { ...await repo.listMakerResults(session, { start: dayStart(range.from), end: dayEnd(range.to) }), queryKey };
  }, [JSON.stringify(session), range, source]);

  if (session.role !== "maker_staff") return <NeedRole role="メーカー" />;
  const data = state.status === "ready" && state.data?.queryKey === queryKey ? state.data : null;
  const stores = data ? [...new Map(data.placements.map((p) => [p.store_id, p.store_name])).entries()] : [];
  const shown = data?.placements.filter((p) => !storeId || p.store_id === storeId) ?? [];

  return (
    <>
      <PageTitle
        title="広告の成果"
        lead="自社広告の結果のうち、店舗が募集ごとに公開を許可した指標だけを表示します。個人の購買明細や他社の広告は表示しません。"
      />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="期間（はじめ）">
            <input type="date" className={inputClass} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          </Field>
          <Field label="期間（おわり）" hint="この日を含む">
            <input type="date" className={inputClass} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </Field>
          <Field label="店舗">
            <select className={inputClass} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">すべての店舗</option>
              {stores.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Legend />
      </Card>
      {(state.status === "loading" || (state.status === "ready" && !data)) && <Loading />}
      {state.status === "error" && <ErrorList errors={[state.error]} />}
      {data && shown.length === 0 && (
        <Empty>承認された広告はまだありません。店舗の募集に申請し、承認されると、ここに成果が出ます。</Empty>
      )}
      {data && (
        <div className="space-y-4">
          {shown.map((p) => (
            <PlacementCard key={p.id} placement={p} app={summarizeApp(p, data.app)} signage={summarizeSignage(p, data.signage)} />
          ))}
        </div>
      )}
    </>
  );
}

function Legend() {
  return (
    <dl className="mt-4 grid gap-x-6 gap-y-1 border-t border-line pt-3 text-xs text-muted sm:grid-cols-2" data-testid="results-legend">
      <div><dt className="inline font-semibold text-ink">0</dt><dd className="inline">：記録はあるが、この期間に該当なし</dd></div>
      <div><dt className="inline font-semibold text-ink">少数のため参考値</dt><dd className="inline">：表示した来店が5未満</dd></div>
      <div><dt className="inline font-semibold text-ink">未計測</dt><dd className="inline">：カメラを使っていない・計測できなかった（0人ではない）</dd></div>
      <div><dt className="inline font-semibold text-ink">非公開</dt><dd className="inline">：店舗がこの募集で公開していない指標</dd></div>
      <div className="sm:col-span-2">
        <dt className="inline font-semibold text-ink">事前投入・模擬</dt>
        <dd className="inline">：デモの操作で生まれた記録（実測）とは別に表示します</dd>
      </div>
    </dl>
  );
}

function PlacementCard({ placement: p, app, signage }: { placement: ResultPlacement; app: AppSummary[]; signage: SignageSummary[] }) {
  const status = PLACEMENT_STATUS[p.status] ?? { label: p.status, tone: "gray" as Tone };
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2" data-testid={`result-${p.id}`}>
        <div>
          <p className="text-lg font-bold">
            {p.product_name}「{p.headline}」<span className="ml-1 text-sm font-normal text-muted">第{p.version}版</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            {p.store_name}｜{p.call_title}｜配信期間 {periodLabel(p.starts_at, p.ends_at)}
          </p>
        </div>
        <span className="flex items-center gap-2">
          <ChannelTags channels={p.channels} />
          <Badge tone={status.tone}>{status.label}</Badge>
        </span>
      </div>
      <p className="mt-2 text-xs text-muted">
        店舗が公開している指標：
        {p.disclosure_scope.length === 0 ? "なし（この募集の成果は非公開）" : p.disclosure_scope.map((m) => DISCLOSURE_LABEL[m]).join("・")}
      </p>
      {p.channels.includes("app") && <AppTable rows={app} />}
      {p.channels.includes("signage") && <SignageTable rows={signage} />}
    </Card>
  );
}

function Table({ title, note, head, children }: { title: string; note: string; head: string[]; children: ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-bold">{title}</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              {head.map((h) => (
                <th key={h} className="py-1 pr-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </div>
  );
}

function AppTable({ rows }: { rows: AppSummary[] }) {
  return (
    <Table
      title="App（おすすめ枠）"
      note="「表示後の購入」は、表示の後に同じ来店で買われた数です。広告が購入の原因であることを示すものではありません。"
      head={["データ", "実表示数", "表示した来店", "クリック", "提案からの追加", "提案からの削除", "表示後の購入", "購入数量", "購入金額"]}
    >
      {rows.map((r) => (
        <tr key={r.origin} className="border-t border-line align-top" data-testid={`app-${r.origin}`}>
          <td className="py-2 pr-3">
            {ORIGIN_LABEL[r.origin]}
            {r.smallSample && (
              <span className="mt-1 block">
                <Badge tone="amber">少数のため参考値</Badge>
              </span>
            )}
          </td>
          <Cell value={r.impressions} />
          <Cell value={r.shownVisits} />
          <Cell value={r.clicks} rateOf={r.impressions} />
          <Cell value={r.recommendationAdds} rateOf={r.impressions} />
          <Cell value={r.recommendationRemoves} />
          <Cell value={r.purchases} rateOf={r.impressions} />
          <Cell value={r.purchasedQuantity} />
          <Cell value={r.purchaseAmount} unit="円" />
        </tr>
      ))}
    </Table>
  );
}

function SignageTable({ rows }: { rows: SignageSummary[] }) {
  return (
    <Table
      title="Signage（店内サイネージ）"
      note="再生は3秒以上表示したもの（動画は最後まで再生したもの）。推定視認はカメラによる推定で、App の購入と同じ人の行動として結び付けていません。同時間帯の販売数は参考で、Signage を見た人の購入とはみなしません。"
      head={["データ", "再生回数", "再生秒数", "計測率", "推定視認人数", "推定視認秒数", "同時間帯の対象商品販売数（参考）"]}
    >
      {rows.map((r) => (
        <tr key={r.origin} className="border-t border-line align-top" data-testid={`signage-${r.origin}`}>
          <td className="py-2 pr-3">{ORIGIN_LABEL[r.origin]}</td>
          <Cell value={r.plays} />
          <Cell value={r.playSeconds} unit="秒" />
          <td className="py-2 pr-3">
            {r.measuredPlays === null ? <Hidden /> : rate(r.measuredPlays, r.plays) === null ? "－" : `${rate(r.measuredPlays, r.plays)}%`}
          </td>
          <Cell value={r.estimatedViewers} unit="人" />
          <Cell value={r.estimatedViewSeconds} unit="秒" />
          <Cell value={r.referenceSales} />
        </tr>
      ))}
    </Table>
  );
}

function Hidden() {
  return <span className="text-muted">非公開</span>;
}

function Cell({ value, rateOf, unit = "" }: { value: MetricValue; rateOf?: MetricValue; unit?: string }) {
  if (value === null) return <td className="py-2 pr-3"><Hidden /></td>;
  if (value === "unmeasured") return <td className="py-2 pr-3 text-muted">未計測</td>;
  const r = rateOf === undefined ? null : rate(value, rateOf);
  return (
    <td className="py-2 pr-3">
      {Math.round(value).toLocaleString("ja-JP")}
      {unit}
      {r !== null && <span className="ml-1 text-xs text-muted">（{r}%）</span>}
    </td>
  );
}
