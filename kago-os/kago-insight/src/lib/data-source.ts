/**
 * 画面とデータの境界。画面はこのファイルの関数しか呼ばない。
 *
 * 現在：src/data/mock の静的JSONを返す。
 * 今後：Core の DB（DB-09 のビュー、DB-08 の関数）へ差し替える。
 *       そのときに書き換えるのはこのファイルだけで、画面は変更しない。
 *
 * 未確定（docs/specs/common-spec.md に記載がない）：
 *  - DB-08 の関数シグネチャ（承認・却下・停止の引数と戻り値）
 *  - DB-09 のビューの列名と粒度
 */

import applicationsMock from "@/data/mock/applications.json";
import placementsMock from "@/data/mock/placements.json";
import promotionsMock from "@/data/mock/promotions.json";
import appMetricsMock from "@/data/mock/metrics-app.json";
import signageMetricsMock from "@/data/mock/metrics-signage.json";
import productsMock from "@/data/mock/products.json";
import type {
  AppMetricRow,
  Application,
  Placement,
  Product,
  Promotion,
  PromotionDraft,
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

export async function fetchApplications(): Promise<Application[]> {
  return delay(applicationsMock as Application[]);
}

export async function fetchPlacements(): Promise<Placement[]> {
  return delay(placementsMock as Placement[]);
}

export async function fetchPromotions(): Promise<Promotion[]> {
  return delay(promotionsMock as Promotion[]);
}

export async function fetchAppMetrics(): Promise<AppMetricRow[]> {
  return delay(appMetricsMock as AppMetricRow[]);
}

export async function fetchSignageMetrics(): Promise<SignageMetricRow[]> {
  return delay(signageMetricsMock as SignageMetricRow[]);
}

/* ------------------------------------------------------------------ */
/* 審査の操作（DB-08）                                                   */
/* ------------------------------------------------------------------ */

export type ReviewResult =
  | { ok: true; applicationId: string; decision: "approved" | "rejected" }
  | { ok: false; error: "not_owner" | "already_decided" | "not_found" };

/**
 * 承認。DB-08 では配信対象 ad_placements の作成と、旧版の superseded 化を
 * まとめて行う想定。引数と戻り値は Core の確定待ち。
 */
export async function approveApplication(
  applicationId: string,
  period: { starts_at: string; ends_at: string },
): Promise<ReviewResult> {
  console.info("[mock] approve_ad", { applicationId, period });
  return delay({ ok: true, applicationId, decision: "approved" } as const);
}

/** 却下。理由は必須（暫定。文字数上限は Ads と要確認） */
export async function rejectApplication(
  applicationId: string,
  reason: string,
): Promise<ReviewResult> {
  console.info("[mock] reject_ad", { applicationId, reason });
  return delay({ ok: true, applicationId, decision: "rejected" } as const);
}

/**
 * 停止。対象は申請ではなく配信対象。
 * 停止から再開できるかは common-spec.md 6章に記載がなく未確定。
 */
export async function suspendPlacement(
  placementId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  console.info("[mock] suspend_ad", { placementId, reason });
  return delay({ ok: true } as const);
}

export async function fetchProducts(): Promise<Product[]> {
  return delay(productsMock as Product[]);
}

/**
 * 店舗販促の保存。
 * common-spec 6章「内容を変えると新しい版を作る」に従い、更新は新版の作成になる。
 * 版の採番が DB 側か画面側かは未確定（G-08）。ここでは DB 側で採番する前提。
 */
export async function savePromotion(
  draft: PromotionDraft,
): Promise<{ ok: true; version: number } | { ok: false; error: string }> {
  console.info("[mock] save_store_promotion", draft);
  return delay({ ok: true, version: 1 } as const);
}

/** 販促の停止。過去の選定記録は書き換えない */
export async function deactivatePromotion(
  promotionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  console.info("[mock] deactivate_store_promotion", { promotionId });
  return delay({ ok: true } as const);
}
