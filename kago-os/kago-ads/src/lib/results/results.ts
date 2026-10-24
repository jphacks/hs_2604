// メーカー向けの成果（ADS-04）。DB-09 の集計（kago_app_metrics・kago_signage_metrics）の行をまとめ、画面で区別する状態を決める
// 状態の区別は共通仕様書 9.4：0件・少数（表示来店数5未満）・未計測・非公開・事前投入／疑似
import type { Channel, DataOrigin, DisclosureMetric, Session, Timestamp } from "../domain/types";

/** DB-09 の App の集計1行（メーカーには自社広告の行だけ。公開範囲の外の指標は null） */
export type AppMetricsRow = {
  store_id: string;
  data_origin: DataOrigin;
  ad_placement_id: string | null;
  impressions: number | null;
  shown_visits: number | null;
  clicks: number | null;
  recommendation_adds: number | null;
  adds_after_impression: number | null;
  recommendation_removes: number | null;
  purchases: number | null;
  purchased_quantity: number | null;
  purchase_amount: number | null;
  small_sample: boolean | null;
};

/** DB-09 の Signage の集計1行（端末・時間帯ごと。3秒以上・案内以外の再生だけ） */
export type SignageMetricsRow = {
  store_id: string;
  data_origin: DataOrigin;
  device_id: string;
  hour_start: Timestamp;
  ad_placement_id: string | null;
  plays: number | null;
  play_seconds: number | null;
  measured_plays: number | null;
  not_measured_plays: number | null;
  error_plays: number | null;
  estimated_viewers: number | null;
  estimated_view_seconds: number | null;
  reference_sales_quantity: number | null;
};

/** 成果を見る自社の配信対象（承認された広告） */
export type ResultPlacement = {
  id: string;
  store_id: string;
  store_name: string;
  call_title: string;
  product_name: string;
  headline: string;
  version: number;
  channels: Channel[];
  starts_at: Timestamp;
  ends_at: Timestamp;
  status: string;
  /** 店舗が募集ごとに決めた公開範囲（ADS-02） */
  disclosure_scope: DisclosureMetric[];
};

export type MakerResults = { placements: ResultPlacement[]; app: AppMetricsRow[]; signage: SignageMetricsRow[] };
export type ResultsQuery = { start: Timestamp; end: Timestamp; storeId?: string };

export interface ResultsRepository {
  /** 自社の配信対象と、その公開された集計。メーカー以外は拒否する */
  listMakerResults(session: Session, query: ResultsQuery): Promise<MakerResults>;
}

export const ORIGIN_LABEL: Record<DataOrigin, string> = { operated: "実測（デモの操作）", seeded: "事前投入", synthetic: "模擬" };
export const SMALL_SAMPLE_VISITS = 5;

/** 指標の値。null は「非公開」、"unmeasured" は「未計測」（0 と区別する） */
export type MetricValue = number | null | "unmeasured";

export type AppSummary = {
  origin: DataOrigin;
  impressions: MetricValue;
  shownVisits: MetricValue;
  clicks: MetricValue;
  recommendationAdds: MetricValue;
  recommendationRemoves: MetricValue;
  purchases: MetricValue;
  purchasedQuantity: MetricValue;
  purchaseAmount: MetricValue;
  /** 表示来店数が1以上5未満。率に「少数のため参考値」と注記する */
  smallSample: boolean;
};

export type SignageSummary = {
  origin: DataOrigin;
  plays: MetricValue;
  playSeconds: MetricValue;
  measuredPlays: MetricValue;
  /** 推定視認人数・秒。計測した再生がなければ未計測 */
  estimatedViewers: MetricValue;
  estimatedViewSeconds: MetricValue;
  /** 同時間帯の対象商品販売数（参考。見た人の購入とはみなさない） */
  referenceSales: MetricValue;
};

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/**
 * 行の値を足す。公開範囲の外なら null（非公開）。DB がすべての行で null にした数も非公開として扱う。
 * nullable の指標（推定視認：計測した再生がなければ null）は、公開されていれば null を 0 として足す
 */
function total<R>(rows: R[], key: keyof R, open: boolean, nullable = false): number | null {
  if (!open) return null;
  if (!nullable && rows.length > 0 && rows.every((r) => r[key] === null)) return null;
  return rows.reduce((acc, r) => acc + (num(r[key]) ?? 0), 0);
}

/** 指標が公開範囲に入っているか（DB-09 と同じ対応） */
export function isDisclosed(scope: DisclosureMetric[], metric: DisclosureMetric) {
  return scope.includes(metric);
}

/**
 * App の行を、配信対象・データの由来ごとに足す。行がなければ 0 件（公開範囲の外は非公開）。
 * DB-09が来店・商品・種別・由来ごとの最初の実表示へ割り当てた行を足す。
 */
export function summarizeApp(placement: ResultPlacement, rows: AppMetricsRow[]): AppSummary[] {
  const mine = rows.filter((r) => r.ad_placement_id === placement.id);
  const origins = [...new Set(mine.map((r) => r.data_origin))];
  const scope = placement.disclosure_scope;
  if (origins.length === 0) origins.push("operated");
  return origins.map((origin) => {
    const rs = mine.filter((r) => r.data_origin === origin);
    const sum = (key: keyof AppMetricsRow, metric: DisclosureMetric): MetricValue => total(rs, key, isDisclosed(scope, metric));
    const shownVisits = sum("shown_visits", "impressions");
    return {
      origin,
      impressions: sum("impressions", "impressions"),
      shownVisits,
      clicks: sum("clicks", "clicks"),
      recommendationAdds: sum("recommendation_adds", "cart_adds"),
      recommendationRemoves: sum("recommendation_removes", "cart_adds"),
      purchases: sum("purchases", "purchases"),
      purchasedQuantity: sum("purchased_quantity", "purchases"),
      purchaseAmount: sum("purchase_amount", "purchases"),
      // 0件は「0」と表示し、少数の注記は付けない（共通仕様書 9.4）
      smallSample: typeof shownVisits === "number" && shownVisits > 0 && shownVisits < SMALL_SAMPLE_VISITS,
    };
  });
}

/** Signage の行を、配信対象・データの由来ごとに足す（再生回数・秒数・計測数は時間帯・端末をまたいで足せる） */
export function summarizeSignage(placement: ResultPlacement, rows: SignageMetricsRow[]): SignageSummary[] {
  const mine = rows.filter((r) => r.ad_placement_id === placement.id);
  const origins = [...new Set(mine.map((r) => r.data_origin))];
  const disclosed = isDisclosed(placement.disclosure_scope, "signage_views");
  const salesDisclosed = isDisclosed(placement.disclosure_scope, "purchases");
  if (origins.length === 0) origins.push("operated");
  return origins.map((origin) => {
    const rs = mine.filter((r) => r.data_origin === origin);
    const measured = total(rs, "measured_plays", disclosed);
    // 計測した再生がなければ「未計測」（0人とは言わない。共通仕様書 9.3）
    const estimate = (key: keyof SignageMetricsRow): MetricValue => {
      const v = total(rs, key, disclosed, true);
      return v === null ? null : measured ? v : "unmeasured";
    };
    // DB-09の販売数量は店舗・商品・時間帯単位。同じ時刻の端末別行には同じ数量が入る。
    // この配信対象は同じ商品なので、店舗・時間帯ごとに1回だけ数える。
    const salesRows = [...new Map(rs.map(r => [r.store_id + "/" + new Date(r.hour_start).toISOString(), r])).values()];
    return {
      origin,
      plays: total(rs, "plays", disclosed),
      playSeconds: total(rs, "play_seconds", disclosed),
      measuredPlays: measured,
      estimatedViewers: estimate("estimated_viewers"),
      estimatedViewSeconds: estimate("estimated_view_seconds"),
      referenceSales: total(salesRows, "reference_sales_quantity", salesDisclosed),
    };
  });
}

/** 率（%）。分子・分母のどちらかが非公開・未計測、または分母が0なら出さない */
export function rate(numerator: MetricValue, denominator: MetricValue): number | null {
  if (typeof numerator !== "number" || typeof denominator !== "number" || denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * 店舗の内部の値を、メーカーに見せる値にする（DB-09 の kago_app_metrics と同じ規則）。仮データ版で使う。
 * 公開範囲の外の指標は null、少数の判定は表示数を公開しているときだけ
 */
export function discloseAppRow(row: AppMetricsRow, scope: DisclosureMetric[]): AppMetricsRow {
  const open = (m: DisclosureMetric) => isDisclosed(scope, m);
  return {
    ...row,
    impressions: open("impressions") ? row.impressions : null,
    shown_visits: open("impressions") ? row.shown_visits : null,
    clicks: open("clicks") ? row.clicks : null,
    recommendation_adds: open("cart_adds") ? row.recommendation_adds : null,
    adds_after_impression: open("cart_adds") ? row.adds_after_impression : null,
    recommendation_removes: open("cart_adds") ? row.recommendation_removes : null,
    purchases: open("purchases") ? row.purchases : null,
    purchased_quantity: open("purchases") ? row.purchased_quantity : null,
    purchase_amount: open("purchases") ? row.purchase_amount : null,
    small_sample: open("impressions") ? (row.shown_visits ?? 0) < SMALL_SAMPLE_VISITS : null,
  };
}

/** Signage の行をメーカーに見せる値にする（DB-09 の kago_signage_metrics と同じ規則） */
export function discloseSignageRow(row: SignageMetricsRow, scope: DisclosureMetric[]): SignageMetricsRow {
  const views = isDisclosed(scope, "signage_views");
  const v = <T,>(x: T) => (views ? x : null);
  return {
    ...row,
    plays: v(row.plays),
    play_seconds: v(row.play_seconds),
    measured_plays: v(row.measured_plays),
    not_measured_plays: v(row.not_measured_plays),
    error_plays: v(row.error_plays),
    estimated_viewers: v(row.estimated_viewers),
    estimated_view_seconds: v(row.estimated_view_seconds),
    reference_sales_quantity: isDisclosed(scope, "purchases") ? row.reference_sales_quantity : null,
  };
}
