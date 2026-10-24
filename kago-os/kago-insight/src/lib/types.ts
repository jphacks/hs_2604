/**
 * 画面が扱うデータの型。
 * 列名は docs/specs/common-spec.md の 5章・5.1 に合わせている。
 * DB-01 で列が確定したら、ここを直して data-source.ts を差し替える。
 */

import type { Channel, DataOrigin, PlacementType } from "./labels";

export type ApplicationStatus = "submitted" | "approved" | "rejected";
export type PlacementStatus = "active" | "suspended" | "expired" | "superseded";
export type MeasurementStatus = "measured" | "not_measured" | "error";

export type Period = {
  starts_at: string;
  ends_at: string;
};

/** 掲載申請（ad_applications）＋ 画面表示用に解決した名前 */
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
  image_path: string;
  headline: string;
  product_id: string;
  product_name: string;
  product_code: string;
  channels: Channel[];
  requested_period: Period;
  status: ApplicationStatus;
  review_comment: string | null;
  /** 暫定項目。G-05（再申請時に前回の却下理由が残るか）が決まったら削除する */
  review_comment_is_previous: boolean;
  submitted_at: string;
};

/** 配信対象（ad_placements） */
export type Placement = {
  id: string;
  application_id: string;
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
};

/** 店舗販促（store_promotions） */
export type Promotion = {
  id: string;
  store_id: string;
  product_id: string;
  product_name: string;
  product_code: string;
  version: number;
  promotion_version_id: string;
  channels: Channel[];
  time_windows: { start: string; end: string }[];
  priority: number;
  reason_text: string;
  starts_at: string;
  ends_at: string;
  status: "active" | "inactive";
};

/** App の集計（DB-09 ビュー相当） */
export type AppMetricRow = {
  store_id: string;
  period: Period;
  channel: "app";
  placement_type: PlacementType;
  ad_placement_id: string | null;
  promotion_version_id: string | null;
  creative_version_id: string | null;
  rule_version: string | null;
  data_origin: DataOrigin;
  selection_items: number;
  impressions: number;
  impression_visits: number;
  clicks: number;
  recommendation_adds: number;
  recommendation_removes: number;
  post_impression_purchases: number;
  post_impression_amount: number;
};

/** Signage の集計 */
export type SignageMetricRow = {
  store_id: string;
  device_id: string;
  hour: string;
  placement_type: PlacementType;
  ad_placement_id: string | null;
  promotion_version_id: string | null;
  creative_version_id: string | null;
  mode: "schedule" | "adaptive" | "fallback";
  data_origin: DataOrigin;
  plays: number;
  play_seconds: number;
  measured_plays: number;
  measurement_status: MeasurementStatus;
  estimated_viewers: number | null;
  estimated_view_seconds: number | null;
  same_hour_product_sales: number;
};
