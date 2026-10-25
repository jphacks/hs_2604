/**
 * 固定JSONからの取得。DBに繋がない状態で画面と計算を確かめるために残してある。
 *
 * 値は common-spec.md §11 の例と一致させてあるので、画面に出る件数と率は手計算で検証できる。
 * NEXT_PUBLIC_INSIGHT_DATA_SOURCE=mock のときだけ使われる。
 */
import { insightPath } from "./paths";
import applicationsMock from "@/data/mock/applications.json";
import placementsMock from "@/data/mock/placements.json";
import promotionsMock from "@/data/mock/promotions.json";
import appMetricsMock from "@/data/mock/metrics-app.json";
import signageMetricsMock from "@/data/mock/metrics-signage.json";
import orderTotalsMock from "@/data/mock/order-totals.json";
import selectionCountsMock from "@/data/mock/selection-counts.json";
import productsMock from "@/data/mock/products.json";
import type { ActionResult } from "./action-result";
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

/** 実際の通信に近い感触を出し、読み込み中の表示を確認できるようにする */
const DELAY_MS = 250;

async function delay<T>(value: T): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  return value;
}

export async function fetchApplications(): Promise<Application[]> {
  // モックの image_path は public/mock 以下の置き場所に対応させてある。
  return delay(
    (applicationsMock as Omit<Application, "image_url">[]).map((row) => ({
      ...row,
      image_url: insightPath(`/mock/${row.image_path}`),
    })),
  );
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

export async function fetchOrderTotals(): Promise<OrderTotals[]> {
  return delay(orderTotalsMock as OrderTotals[]);
}

export async function fetchSelectionCounts(): Promise<SelectionCount[]> {
  return delay(selectionCountsMock as SelectionCount[]);
}

/* ------------------------------------------------------------------ */
/* 操作。実際には何も書き込まず、送る引数だけをログに出す                   */
/* ------------------------------------------------------------------ */

export async function approveApplication(
  applicationId: string,
  expectedRevision: number,
  options?: { starts_at?: string; ends_at?: string; channels?: Channel[] },
): Promise<ActionResult<{ placement_id: string; revision: number; replayed: boolean }>> {
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
  return delay({ ok: true, data: { revision: expectedRevision, replayed: false } } as const);
}

export async function suspendPlacement(
  placementId: string,
  reason: string,
): Promise<ActionResult<{ placement_id: string; replayed: boolean }>> {
  console.info("[mock] kago_suspend_placement", { p_placement_id: placementId, p_reason: reason });
  return delay({ ok: true, data: { placement_id: placementId, replayed: false } } as const);
}

export async function savePromotion(
  draft: PromotionDraft,
): Promise<ActionResult<{ promotion_id: string; promotion_version_id: string; version: number }>> {
  console.info("[mock] save_store_promotion", draft);
  return delay({
    ok: true,
    data: { promotion_id: draft.promotion_id ?? "SP-mock", promotion_version_id: "PV-mock", version: 1 },
  } as const);
}

export async function deactivatePromotion(
  promotionId: string,
): Promise<ActionResult<{ promotion_id: string }>> {
  console.info("[mock] deactivate_store_promotion", { promotionId });
  return delay({ ok: true, data: { promotion_id: promotionId } } as const);
}
