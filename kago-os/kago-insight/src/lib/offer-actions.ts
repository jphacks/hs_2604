"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "./action-result";
import { saveProductDiscount, type SaveDiscountResult } from "./supabase-offers";

/** DEMO-03。画面からの保存はここを通る */
export async function saveDiscount(
  productId: string,
  percent: number | null,
): Promise<ActionResult<SaveDiscountResult>> {
  const result = await saveProductDiscount(productId, percent);
  if (result.ok) revalidatePath("/offers");
  return result;
}
