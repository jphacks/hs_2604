/**
 * 画面が扱うデータの型。
 * 列名は kago-core の migration に合わせている。
 *   20261024050000_ads_promotions.sql  … DB-04
 *   20261024090000_ad_approval.sql     … DB-08
 *   20261024100000_metric_views.sql    … DB-09
 * 公開範囲の外にある指標は DB が null を返すため、数値は nullable にしている。
 */

import type { Channel, DataOrigin, PlacementType } from "./labels";

// 画面は型を types.ts からまとめて取れるようにする
export type { Channel, DataOrigin, PlacementType };

export type ApplicationStatus = "submitted" | "approved" | "rejected";
export type PlacementStatus = "active" | "suspended" | "expired" | "superseded";
export type MeasurementStatus = "measured" | "not_measured" | "error";

/** requested_period は DB では tstzrange [start, end)。画面では分解して扱う */
export type Period = {
  starts_at: string;
  ends_at: string;
};

/** application_revisions の1行。再申請の履歴 */
export type ApplicationRevision = {
  revision: number;
  creative_version_id: string;
  creative_version: number;
  image_path: string;
  headline: string;
  channels: Channel[];
  requested_period: Period;
  submitted_at: string;
  status: ApplicationStatus;
  review_comment: string | null;
  reviewed_at: string | null;
};

/** ad_applications ＋ 画面表示用に解決した名前 */
export type Application = {
  id: string;
  ad_call_id: string;
  ad_call_title: string;
  maker_id: string;
  maker_display_name: string;
  maker_is_fictional: boolean;
  creative_id: string;
  creative_version_id: string;
  creative_version: number;
  /** ストレージのオブジェクトキー。URLではない（COM-03）。表示時にURLへ変換する */
  image_path: string;
  headline: string;
  product_id: string;
  product_name: string;
  product_code: string;
  channels: Channel[];
  requested_period: Period;
  message: string | null;
  /** 楽観ロックに使う。審査時に expected_revision として送る */
  revision: number;
  status: ApplicationStatus;
  review_comment: string | null;
  submitted_at: string;
  /** 過去の版。再申請のとき前回の却下理由を出すために使う */
  history: ApplicationRevision[];
};

/** ad_placements */
export type Placement = {
  id: string;
  application_id: string;
  revision: number;
  store_id: string;
  creative_version_id: string;
  product_name: string;
  maker_display_name: string;
  channels: Channel[];
  starts_at: string;
  ends_at: string;
  status: PlacementStatus;
  approved_by: string;
  approved_at: string;
  suspend_reason: string | null;
  suspended_at: string | null;
};

/** 時間帯。weekdays は 1=月 〜 7=日。end は 24:00 を許す */
export type TimeWindow = {
  weekdays: number[];
  start: string;
  end: string;
};

/** store_promotions ＋ 現在有効な promotion_versions */
export type Promotion = {
  id: string;
  store_id: string;
  product_id: string;
  product_name: string;
  product_code: string;
  /** promotion_versions.id。選定記録が参照する */
  promotion_version_id: string;
  version: number;
  channels: Channel[];
  time_windows: TimeWindow[];
  priority: number;
  reason_text: string;
  starts_at: string;
  ends_at: string;
  status: "active" | "inactive";
};

/** 商品（products ＋ store_products の価格） */
export type Product = {
  product_id: string;
  code: string;
  name: string;
  price: number;
  category: string;
};

/** 販促の保存内容。version と status は DB 側で決まる */
export type PromotionDraft = {
  promotion_id: string | null;
  product_id: string;
  channels: Channel[];
  time_windows: TimeWindow[];
  priority: number;
  reason_text: string;
  starts_at: string;
  ends_at: string;
};

/** kago_app_metrics の1行 */
export type AppMetricRow = {
  store_id: string;
  channel: "app";
  data_origin: DataOrigin;
  placement_type: PlacementType;
  ad_placement_id: string | null;
  promotion_version_id: string | null;
  rule_version: number | null;
  impressions: number | null;
  shown_visits: number | null;
  clicks: number | null;
  recommendation_adds: number | null;
  adds_after_impression: number | null;
  recommendation_removes: number | null;
  purchases: number | null;
  purchased_quantity: number | null;
  purchase_amount: number | null;
  /** 表示来店数が5未満。画面で計算せず DB の判定を使う */
  small_sample: boolean | null;
  disclosed_metrics: string[];
};

/** kago_signage_metrics の1行 */
export type SignageMetricRow = {
  store_id: string;
  channel: "signage";
  data_origin: DataOrigin;
  device_id: string;
  hour_start: string;
  ad_placement_id: string | null;
  promotion_version_id: string | null;
  mode: "schedule" | "adaptive" | "fallback";
  plays: number | null;
  play_seconds: number | null;
  measured_plays: number | null;
  not_measured_plays: number | null;
  error_plays: number | null;
  estimated_viewers: number | null;
  estimated_view_seconds: number | null;
  synthetic_estimates: number | null;
  synthetic_viewers: number | null;
  synthetic_view_seconds: number | null;
  reference_sales_quantity: number | null;
  disclosed_metrics: string[];
};

/** kago_order_totals。全体の購入値はここから取る（種別別の値を足さない） */
export type OrderTotals = {
  data_origin: DataOrigin;
  orders: number;
  quantity: number;
  amount: number;
};

/** kago_selection_counts。選定枠数は実表示とは別のビュー */
export type SelectionCount = {
  store_id: string;
  day_jst: string;
  placement_type: PlacementType;
  ad_placement_id: string | null;
  promotion_version_id: string | null;
  rule_version: number | null;
  data_origin: "unclassified";
  selected_slots: number;
};
