/**
 * 画面とデータの境界。画面はこのファイルの関数しか呼ばない。
 *
 * 現在：src/data/mock の静的JSONを返す。
 * 今後：Core の DB へ差し替える。引数・戻り値・エラーは既に DB の定義に合わせてあるので、
 *       書き換えるのはこのファイルの中身だけで、画面は変更しない。
 *
 * 対応する DB 側の定義（kago-core/supabase/migrations）
 *   20261024090000_ad_approval.sql
 *     kago_approve_application(p_application_id, p_expected_revision, p_starts_at, p_ends_at, p_channels)
 *     kago_reject_application(p_application_id, p_expected_revision, p_reason)
 *     kago_suspend_placement(p_placement_id, p_reason)
 *   20261024100000_metric_views.sql
 *     kago_app_metrics / kago_signage_metrics / kago_order_totals / kago_selection_counts
 */

import applicationsMock from "@/data/mock/applications.json";
import placementsMock from "@/data/mock/placements.json";
import promotionsMock from "@/data/mock/promotions.json";
import appMetricsMock from "@/data/mock/metrics-app.json";
import signageMetricsMock from "@/data/mock/metrics-signage.json";
import orderTotalsMock from "@/data/mock/order-totals.json";
import selectionCountsMock from "@/data/mock/selection-counts.json";
import productsMock from "@/data/mock/products.json";
import type {
  AppMetricRow,
  Application,
  Channel,
  OrderTotals,
  Placement,
  Product,
  Promotion,
  PromotionDraft,
  SelectionCount,
  SignageMetricRow,
} from "./types";

/** モックであることを画面に出すためのフラグ */
export const USING_MOCK = true;

/** 実際の通信に近い感触を出し、読み込み中の表示を確認できるようにする */
const DELAY_MS = 250;

async function delay<T>(value: T): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  return value;
}

/* ------------------------------------------------------------------ */
/* 取得                                                                 */
/* ------------------------------------------------------------------ */

export async function fetchApplications(): Promise<Application[]> {
  return delay(applicationsMock as Application[]);
}

export async function fetchPlacements(): Promise<Placement[]> {
  return delay(placementsMock as Placement[]);
}

export async function fetchPromotions(): Promise<Promotion[]> {
  return delay(promotionsMock as Promotion[]);
}

export async function fetchProducts(): Promise<Product[]> {
  return delay(productsMock as Product[]);
}

export async function fetchAppMetrics(): Promise<AppMetricRow[]> {
  return delay(appMetricsMock as AppMetricRow[]);
}

export async function fetchSignageMetrics(): Promise<SignageMetricRow[]> {
  return delay(signageMetricsMock as SignageMetricRow[]);
}

/** 全体の購入値。種別別の値を足さずにここから取る（common-spec 9.1.1） */
export async function fetchOrderTotals(): Promise<OrderTotals[]> {
  return delay(orderTotalsMock as OrderTotals[]);
}

/** 選定枠数。実表示とは別のビュー。由来は unclassified で返る */
export async function fetchSelectionCounts(): Promise<SelectionCount[]> {
  return delay(selectionCountsMock as SelectionCount[]);
}

/**
 * 素材画像のURLを作る。
 * DB の creative_versions.image_path は URL ではなくストレージのオブジェクトキー（COM-03）。
 * 本番では Supabase Storage の公開URLまたは署名付きURLに変換する。
 */
export function creativeImageUrl(imagePath: string): string {
  return `/mock/${imagePath}`;
}

/* ------------------------------------------------------------------ */
/* 審査の操作（DB-08）                                                   */
/* ------------------------------------------------------------------ */

/** DB が返すエラーの分類。PostgreSQL のエラーコードに対応する */
export type ActionErrorCode =
  | "not_staff" // 42501
  | "revision_changed" // 40001 + detail revision_changed
  | "conflict" // 23505
  | "invalid_state" // 23514
  | "invalid_argument" // 22023
  | "unknown";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ActionErrorCode; message: string };

export function actionErrorMessage(code: ActionErrorCode): string {
  switch (code) {
    case "not_staff":
      return "この申請は自店舗のものではないため操作できません。";
    case "revision_changed":
      return "この画面を開いた後にメーカーが再申請しました。内容が変わっているので、再読み込みしてから確認してください。";
    case "conflict":
      return "すでに別の内容で審査されています。再読み込みしてください。";
    case "invalid_state":
      return "この状態では実行できません。期間・掲載先・配信状態を確認してください。";
    case "invalid_argument":
      return "入力内容が正しくありません。理由は1〜200文字で入力してください。";
    case "unknown":
      return "処理できませんでした。時間をおいて再度お試しください。";
  }
}

export type ApproveResult = {
  placement_id: string;
  revision: number;
  /** 同じ操作の再送で、すでに同じ内容で承認済みだった場合に true */
  replayed: boolean;
};

/**
 * 承認。配信対象の作成と旧版の superseded 化を DB 側が一度に行う。
 * 期間と掲載先は省略するとメーカーの希望どおり。指定する場合は狭める方向のみ許される。
 */
export async function approveApplication(
  applicationId: string,
  expectedRevision: number,
  options?: { starts_at?: string; ends_at?: string; channels?: Channel[] },
): Promise<ActionResult<ApproveResult>> {
  console.info("[mock] kago_approve_application", {
    p_application_id: applicationId,
    p_expected_revision: expectedRevision,
    p_starts_at: options?.starts_at ?? null,
    p_ends_at: options?.ends_at ?? null,
    p_channels: options?.channels ?? null,
  });
  return delay({
    ok: true,
    data: { placement_id: "PL-mock", revision: expectedRevision, replayed: false },
  } as const);
}

/** 却下。理由は必須で1〜200文字 */
export async function rejectApplication(
  applicationId: string,
  expectedRevision: number,
  reason: string,
): Promise<ActionResult<{ revision: number; replayed: boolean }>> {
  console.info("[mock] kago_reject_application", {
    p_application_id: applicationId,
    p_expected_revision: expectedRevision,
    p_reason: reason,
  });
  return delay({
    ok: true,
    data: { revision: expectedRevision, replayed: false },
  } as const);
}

/**
 * 配信の停止。対象は申請ではなく配信対象。
 * 停止したものは再開できない。再開するにはメーカーの再申請と再承認が必要（DB-08）。
 */
export async function suspendPlacement(
  placementId: string,
  reason: string,
): Promise<ActionResult<{ placement_id: string; replayed: boolean }>> {
  console.info("[mock] kago_suspend_placement", {
    p_placement_id: placementId,
    p_reason: reason,
  });
  return delay({
    ok: true,
    data: { placement_id: placementId, replayed: false },
  } as const);
}

/* ------------------------------------------------------------------ */
/* 店舗販促                                                             */
/* ------------------------------------------------------------------ */

/**
 * 店舗販促の保存。内容を変えると promotion_versions に新しい版が作られる。
 * 版の採番は DB 側。time_windows は weekdays（1=月〜7=日）が必須。
 */
export async function savePromotion(
  draft: PromotionDraft,
): Promise<ActionResult<{ promotion_version_id: string; version: number }>> {
  console.info("[mock] save_store_promotion", draft);
  return delay({
    ok: true,
    data: { promotion_version_id: "SP-mock", version: 1 },
  } as const);
}

/** 販促の停止。過去の選定記録は書き換えない */
export async function deactivatePromotion(
  promotionId: string,
): Promise<ActionResult<{ promotion_id: string }>> {
  console.info("[mock] deactivate_store_promotion", { promotionId });
  return delay({ ok: true, data: { promotion_id: promotionId } } as const);
}
