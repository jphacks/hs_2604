"use server";

/**
 * 画面からの書き込み。すべてサーバ側で実行する。
 * publishable key しか使わないので、権限は Supabase の RLS と
 * security definer 関数の中の判定だけで決まる（DB-07・DB-08）。
 */
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./action-result";
import * as mock from "./mock-source";
import { USING_MOCK } from "./mode";
import * as supabase from "./supabase-actions";
import type { Channel, PromotionDraft } from "./types";

const impl = USING_MOCK ? mock : supabase;

export async function approveApplication(
  applicationId: string,
  expectedRevision: number,
  options?: { starts_at?: string; ends_at?: string; channels?: Channel[] },
): Promise<ActionResult<{ placement_id: string; revision: number; replayed: boolean }>> {
  const result = await impl.approveApplication(applicationId, expectedRevision, options);
  if (result.ok) revalidatePath("/review");
  return result;
}

export async function rejectApplication(
  applicationId: string,
  expectedRevision: number,
  reason: string,
): Promise<ActionResult<{ revision: number; replayed: boolean }>> {
  const result = await impl.rejectApplication(applicationId, expectedRevision, reason);
  if (result.ok) revalidatePath("/review");
  return result;
}

export async function suspendPlacement(
  placementId: string,
  reason: string,
): Promise<ActionResult<{ placement_id: string; replayed: boolean }>> {
  const result = await impl.suspendPlacement(placementId, reason);
  if (result.ok) revalidatePath("/review");
  return result;
}

export async function savePromotion(
  draft: PromotionDraft,
): Promise<ActionResult<{ promotion_id: string; promotion_version_id: string; version: number }>> {
  const result = await impl.savePromotion(draft);
  if (result.ok) revalidatePath("/promotions");
  return result;
}

export async function deactivatePromotion(
  promotionId: string,
): Promise<ActionResult<{ promotion_id: string }>> {
  const result = await impl.deactivatePromotion(promotionId);
  if (result.ok) revalidatePath("/promotions");
  return result;
}
