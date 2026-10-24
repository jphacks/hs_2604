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

/**
 * 店舗販促の保存。
 *
 * DB-04 には販促を更新する関数が無く、版は promotion_versions への挿入で増やす。
 * 版番号は max(version)+1 でなければ 23514 で弾かれ、有効な版は1つまでなので、
 *   1) 今の有効な版を inactive にする
 *   2) 新しい版を active で挿入する
 * の順に実行する。この2文は1つのトランザクションにまとまっていないため、
 * 2 が失敗すると有効な版が無い状態で残る。画面はその場合に再試行を促す。
 * （Core に販促保存用の関数を足してもらえれば、ここは1回の RPC で済む）
 */
export async function savePromotion(
  draft: PromotionDraft,
): Promise<ActionResult<{ promotion_id: string; promotion_version_id: string; version: number }>> {
  try {
    const { client, storeId } = await writableSession();

    let promotionId = draft.promotion_id;
    if (!promotionId) {
      // 同じ商品の販促がすでにあるなら作り直さず版を足す。
      const { data: existing, error: existingError } = await client
        .from("store_promotions")
        .select("id")
        .eq("store_id", storeId)
        .eq("product_id", draft.product_id)
        .limit(1);
      if (existingError) throw existingError;
      promotionId = (existing?.[0]?.id as string | undefined) ?? null;
    }
    if (!promotionId) {
      const { data: created, error: createError } = await client
        .from("store_promotions")
        .insert({ store_id: storeId, product_id: draft.product_id })
        .select("id")
        .single();
      if (createError) throw createError;
      promotionId = created.id as string;
    }

    const { data: versions, error: versionError } = await client
      .from("promotion_versions")
      .select("id, version, status")
      .eq("promotion_id", promotionId)
      .order("version", { ascending: false });
    if (versionError) throw versionError;
    const nextVersion = ((versions?.[0]?.version as number | undefined) ?? 0) + 1;
    const active = versions?.find((row) => row.status === "active");

    if (active) {
      const { error: stopError } = await client
        .from("promotion_versions")
        .update({ status: "inactive" })
        .eq("id", active.id);
      if (stopError) throw stopError;
    }

    const { data: inserted, error: insertError } = await client
      .from("promotion_versions")
      .insert({
        promotion_id: promotionId,
        version: nextVersion,
        channels: draft.channels,
        time_windows: draft.time_windows,
        priority: draft.priority,
        reason_text: draft.reason_text,
        starts_at: draft.starts_at,
        ends_at: draft.ends_at,
        status: "active",
      })
      .select("id, version")
      .single();
    if (insertError) throw insertError;

    return {
      ok: true,
      data: {
        promotion_id: promotionId,
        promotion_version_id: inserted.id as string,
        version: inserted.version as number,
      },
    };
  } catch (error) {
    return actionFailure(error);
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
