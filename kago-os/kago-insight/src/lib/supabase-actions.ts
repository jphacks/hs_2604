import "server-only";

import { BackendError, getBackendIdentity } from "@kago/backend";
import { actionFailure, type ActionResult } from "./action-result";
import { createServerBackendClient } from "./backend/server";
import type { Channel, PromotionDraft } from "./types";

/**
 * 共通DBへの書き込み。
 *
 * 審査の3操作は DB-08 の関数を呼ぶだけで、判定も記録も DB 側で完結する。
 * 画面側で状態遷移を組み立てない（組み立てると DB の検査と二重になり、ずれる）。
 */

/** 書き込み用の接続。Server Action の中なので Cookie の更新を許す */
async function writableSession() {
  const client = await createServerBackendClient({ writableCookies: true });
  const identity = await getBackendIdentity(client, "store_staff");
  const { data, error } = await client.from("store_members").select("store_id").limit(1);
  if (error) throw new BackendError("connection_failed");
  const storeId = data?.[0]?.store_id as string | undefined;
  if (!storeId) throw new BackendError("forbidden");
  return { client, userId: identity.userId, storeId };
}

/** returns table の関数は配列で返る。1行だけ取り出す */
function firstRow<T>(data: unknown): T {
  const rows = (Array.isArray(data) ? data : [data]) as T[];
  if (!rows[0]) throw new Error("DBが結果を返しませんでした");
  return rows[0];
}

export async function approveApplication(
  applicationId: string,
  expectedRevision: number,
  options?: { starts_at?: string; ends_at?: string; channels?: Channel[] },
): Promise<ActionResult<{ placement_id: string; revision: number; replayed: boolean }>> {
  try {
    const { client } = await writableSession();
    // 省略した引数は null で送る。DB 側がメーカーの希望どおりに扱う。
    const { data, error } = await client.rpc("kago_approve_application", {
      p_application_id: applicationId,
      p_expected_revision: expectedRevision,
      p_starts_at: options?.starts_at ?? null,
      p_ends_at: options?.ends_at ?? null,
      p_channels: options?.channels ?? null,
    });
    if (error) throw error;
    const row = firstRow<{ placement_id: string; revision: number; replayed: boolean }>(data);
    return { ok: true, data: row };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function rejectApplication(
  applicationId: string,
  expectedRevision: number,
  reason: string,
): Promise<ActionResult<{ revision: number; replayed: boolean }>> {
  try {
    const { client } = await writableSession();
    const { data, error } = await client.rpc("kago_reject_application", {
      p_application_id: applicationId,
      p_expected_revision: expectedRevision,
      p_reason: reason,
    });
    if (error) throw error;
    return { ok: true, data: firstRow<{ revision: number; replayed: boolean }>(data) };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function suspendPlacement(
  placementId: string,
  reason: string,
): Promise<ActionResult<{ placement_id: string; replayed: boolean }>> {
  try {
    const { client } = await writableSession();
    const { data, error } = await client.rpc("kago_suspend_placement", {
      p_placement_id: placementId,
      p_reason: reason,
    });
    if (error) throw error;
    return { ok: true, data: firstRow<{ placement_id: string; replayed: boolean }>(data) };
  } catch (error) {
    return actionFailure(error);
  }
}

/** Save the next version and stop the previous one in one guarded transaction. */
export async function savePromotion(
  draft: PromotionDraft,
): Promise<ActionResult<{ promotion_id: string; promotion_version_id: string; version: number }>> {
  try {
    const { client, storeId } = await writableSession();
    const { data, error } = await client.rpc("kago_save_promotion", {
      p_store_id: storeId, p_product_id: draft.product_id,
      p_channels: draft.channels, p_time_windows: draft.time_windows,
      p_priority: draft.priority, p_reason_text: draft.reason_text,
      p_starts_at: draft.starts_at, p_ends_at: draft.ends_at,
      p_promotion_id: draft.promotion_id, p_expected_version: draft.expected_version ?? null,
    });
    if (error) throw error;
    return { ok: true, data: firstRow<{ promotion_id: string; promotion_version_id: string; version: number }>(data) };
  } catch (error) {
    const result = actionFailure(error);
    return result.code === "revision_changed" ? { ...result, message: "おすすめ設定が更新されています。再読み込みしてから保存してください。" } : result;
  }
}

/** 販促の停止。過去の版は書き換えない（active -> inactive だけが許される） */
export async function deactivatePromotion(
  promotionId: string,
): Promise<ActionResult<{ promotion_id: string }>> {
  try {
    const { client } = await writableSession();
    const { error } = await client
      .from("promotion_versions")
      .update({ status: "inactive" })
      .eq("promotion_id", promotionId)
      .eq("status", "active");
    if (error) throw error;
    return { ok: true, data: { promotion_id: promotionId } };
  } catch (error) {
    return actionFailure(error);
  }
}
