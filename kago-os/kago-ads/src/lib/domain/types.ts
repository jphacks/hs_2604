// KAGO/Ads・Signage で使う共通の型。名前と値は hs_2604/docs/specs/common-spec.md（共通仕様書）に合わせる
// DB の行と同じ形にするため、列名はスネークケースのまま持つ（Supabase の応答をそのまま入れられる）
// 共通仕様書にない列には「提案」と書いた（共通仕様書 13 章で追加を提案する）

/** 媒体（共通仕様書 4.2） */
export type Channel = "app" | "signage";
export const CHANNELS: Channel[] = ["app", "signage"];
export const CHANNEL_LABEL: Record<Channel, string> = { app: "App", signage: "Signage" };

/** 提案の種別（共通仕様書 D-03）。Signage の案内は種別ではなく再生記録の mode = fallback */
export type PlacementType = "organic" | "store_promo" | "sponsored";

/** データの由来（共通仕様書 4.2） */
export type DataOrigin = "operated" | "seeded" | "synthetic";

/** 時刻はタイムゾーン付きの ISO 8601 文字列（共通仕様書 4.2、D-09） */
export type Timestamp = string;

export type Store = {
  id: string;
  slug: string;
  name: string;
  branch_name: string;
  timezone: string;
  /** 提案：募集ポータル（ADS-01）で店舗を紹介する文 */
  description: string;
  /** 提案：住所の目安 */
  address: string;
};

/** Signage 端末（共通仕様書 5） */
export type SignageDevice = { id: string; store_id: string; slug: string; location: string };

export type Maker = { id: string; slug: string; display_name: string; is_fictional: boolean };

/** 商品（共通仕様書 5）。code は商品コード（先頭の0を保つ文字列） */
export type Product = { id: string; code: string; name: string; category: string };

/** 店舗別商品（価格は円の整数・税込） */
export type StoreProduct = { store_id: string; product_id: string; price: number; is_active: boolean };

/** メーカーに公開する指標（共通仕様書 5 の disclosure_scope） */
export type DisclosureMetric = "impressions" | "clicks" | "cart_adds" | "purchases" | "signage_views";
export const DISCLOSURE_METRICS: DisclosureMetric[] = ["impressions", "clicks", "cart_adds", "purchases", "signage_views"];
export const DISCLOSURE_LABEL: Record<DisclosureMetric, string> = {
  impressions: "App の実表示数",
  clicks: "App のクリック数",
  cart_adds: "App の提案経由の追加数",
  purchases: "App の表示後の購入数",
  signage_views: "Signage の再生回数・推定視認",
};

/** 広告募集の状態（共通仕様書 6）。期間切れは status とは別に判定する（rules.ts の callPhase） */
export type AdCallStatus = "draft" | "open" | "closed";

/** 広告募集 ad_calls（ADS-02 で店舗が作る） */
export type AdCall = {
  id: string;
  store_id: string;
  title: string;
  categories: string[];
  channels: Channel[];
  starts_at: Timestamp;
  ends_at: Timestamp;
  status: AdCallStatus;
  /** ADS-02 で店舗が募集ごとに設定する */
  disclosure_scope: DisclosureMetric[];
  /** 提案：案内文（issues.md の ADS-02 にあり、共通仕様書の列にない） */
  description: string;
  created_at: Timestamp;
  updated_at: Timestamp;
};

/** 素材のファイル。path は保存先（COM-03）。仮データでは配信 URL をそのまま入れる */
export type MediaAsset = {
  kind: "image" | "video";
  path: string;
  width: number;
  height: number;
  bytes: number;
  duration_sec?: number;
  file_name: string;
};

/** 広告素材 creatives（店舗から独立したメーカーの持ち物） */
export type Creative = { id: string; maker_id: string; product_id: string; created_at: Timestamp };

/** 素材の版 creative_versions。提案：媒体ごとに素材を持つ（共通仕様書は image_path が1つ） */
export type CreativeVersion = {
  id: string;
  creative_id: string;
  version: number;
  headline: string;
  assets: Partial<Record<Channel, MediaAsset>>;
  /** 提案：何を変えた版か */
  note: string;
  created_at: Timestamp;
};

/** 掲載申請の状態（共通仕様書 6） */
export type ApplicationStatus = "submitted" | "approved" | "rejected";
export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  submitted: "審査中",
  approved: "承認",
  rejected: "却下",
};

/** 提案：申請の各回（再申請の履歴）。共通仕様書は同じ申請を submitted に戻すだけで、履歴の持ち方がない */
export type ApplicationRevision = {
  rev: number;
  creative_version_id: string;
  channels: Channel[];
  requested_start: Timestamp;
  requested_end: Timestamp;
  /** 提案：メーカーから店舗へのメッセージ */
  message: string;
  submitted_at: Timestamp;
  status: ApplicationStatus;
  review_comment?: string;
  reviewed_at?: Timestamp;
};

/** 掲載申請 ad_applications。上の列は最新の回と同じ値 */
export type AdApplication = {
  id: string;
  ad_call_id: string;
  /** 提案：権限（DB-06）を簡単にするため申請にも店舗を持つ */
  store_id: string;
  maker_id: string;
  creative_id: string;
  creative_version_id: string;
  channels: Channel[];
  requested_start: Timestamp;
  requested_end: Timestamp;
  status: ApplicationStatus;
  review_comment?: string;
  revisions: ApplicationRevision[];
  created_at: Timestamp;
  updated_at: Timestamp;
};

/** 配信対象の状態（共通仕様書 6）。expired は保存せず期間から判定する */
export type PlacementStatus = "active" | "suspended" | "superseded";

/** 配信対象 ad_placements（INS-01 の承認で DB-08 が作る）。channels は申請の一部に絞れる */
export type AdPlacement = {
  id: string;
  application_id: string;
  store_id: string;
  creative_version_id: string;
  channels: Channel[];
  starts_at: Timestamp;
  ends_at: Timestamp;
  status: PlacementStatus;
  approved_by: string;
  approved_at: Timestamp;
  /** 提案：停止の理由 */
  suspend_reason?: string;
};

/**
 * デモ用のログイン状態。役割の名前は共通の認証（kago-os/shared/backend の roles）に合わせる。
 * 共通の認証へ切り替えるときは、店舗・メーカーの所属を store_members・maker_members から読む
 */
export type Session =
  | { role: "guest" }
  | { role: "store_staff"; storeId: string }
  | { role: "maker_staff"; makerId: string };
