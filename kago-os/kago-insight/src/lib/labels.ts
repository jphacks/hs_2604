/**
 * 画面表示名の対応表。
 * DBには英小文字のスネークケースだけを保存し、日本語は持たせない（common-spec.md 4.2）。
 */

export const placementTypeLabel = {
  organic: "通常推薦",
  store_promo: "店舗販促",
  sponsored: "メーカー広告",
} as const;

export const channelLabel = {
  app: "App",
  signage: "Signage",
} as const;

export const dataOriginLabel = {
  operated: "実際の動作",
  seeded: "事前投入",
  synthetic: "疑似値",
} as const;

export const applicationStatusLabel = {
  submitted: "審査待ち",
  approved: "承認済み",
  rejected: "却下",
} as const;

export const placementStatusLabel = {
  active: "配信中",
  suspended: "停止中",
  expired: "期間終了",
  superseded: "旧版",
} as const;

export const measurementStatusLabel = {
  measured: "計測済み",
  not_measured: "未計測",
  error: "計測失敗",
} as const;

export type PlacementType = keyof typeof placementTypeLabel;
export type Channel = keyof typeof channelLabel;
export type DataOrigin = keyof typeof dataOriginLabel;
