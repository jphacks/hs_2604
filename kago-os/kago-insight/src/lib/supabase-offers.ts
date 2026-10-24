import "server-only";

import { actionFailure, type ActionResult } from "./action-result";
import { createServerBackendClient } from "./backend/server";
import { requireStoreSession } from "./store";
import { getBackendIdentity, BackendError } from "@kago/backend";
import { num } from "./pg";

/**
 * DEMO-03 商品ごとの値引き率。
 *
 * store_offers（APP-13 / #93）へ「きっかけ商品なしのゲリラクーポン」として保存する。
 *
 * DBの制約から来る決まりごと
 *   - 作成後に条件は変えられない。status を active -> inactive にできるだけ（kago_guard_store_offer）
 *     なので「変更」は “旧設定を停止して新規作成” になる
 *   - 更新できる列は status だけ（grant update (status)）
 *   - discount_percent は 1〜90。discount_amount とどちらか一方のみ
 *   - headline は必須で60字以内。画面は%しか入力しないので商品名から組み立てる
 *   - 同じ商品に active が複数あっても制約上は許される。Appは大きい値引きを採用するため、
 *     必ず「停止 -> 作成」の順に実行する。途中で失敗したら値引きなしに倒れて安全側になる
 */

/** 値引き期間の既定。APP-13 のデモデータに合わせて30日 */
const DEFAULT_DAYS = 30;
const HEADLINE_MAX = 60;

export type ProductDiscount = {
  product_id: string;
  code: string;
  name: string;
  category: string;
  price: number;
  /** 有効な値引きが無ければ null */
  offer_id: string | null;
  discount_percent: number | null;
  ends_at: string | null;
};

/** 自店の取扱商品と、いま有効な値引きを突き合わせて返す */
export async function fetchProductDiscounts(): Promise<ProductDiscount[]> {
  const { client, store } = await requireStoreSession();

  const { data: storeProducts, error } = await client
    .from("store_products")
    .select("product_id, price")
    .eq("store_id", store.id)
    .eq("is_active", true);
  if (error) throw new Error(`取扱商品の取得に失敗しました: ${error.message}`);
  const rows = storeProducts ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.product_id as string);
  const [{ data: products, error: productError }, { data: offers, error: offerError }] =
    await Promise.all([
      client.from("products").select("id, code, name, category").in("id", ids),
      client
        .from("store_offers")
        .select("id, product_id, discount_percent, ends_at, created_at")
        .eq("store_id", store.id)
        .eq("kind", "guerrilla_coupon")
        .eq("status", "active")
        .is("trigger_product_id", null)
        .order("created_at", { ascending: false }),
    ]);
  if (productError) throw new Error(`商品の取得に失敗しました: ${productError.message}`);
  if (offerError) throw new Error(`値引き設定の取得に失敗しました: ${offerError.message}`);

  const productById = new Map((products ?? []).map((p) => [p.id as string, p]));
  // 同じ商品に有効なものが複数あれば、新しいほうを画面に出す
  const offerByProduct = new Map<string, Record<string, unknown>>();
  for (const offer of offers ?? []) {
    const key = offer.product_id as string;
    if (!offerByProduct.has(key)) offerByProduct.set(key, offer);
  }

  return rows
    .map((row) => {
      const product = productById.get(row.product_id as string);
      if (!product) return null;
      const offer = offerByProduct.get(row.product_id as string);
      return {
        product_id: row.product_id as string,
        code: product.code as string,
        name: product.name as string,
        category: product.category as string,
        price: num(row.price) ?? 0,
        offer_id: (offer?.id as string | undefined) ?? null,
        discount_percent: offer ? num(offer.discount_percent) : null,
        ends_at: (offer?.ends_at as string | undefined) ?? null,
      };
    })
    .filter((row): row is ProductDiscount => row !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

/** 書き込み用の接続。Server Action の中なので Cookie の更新を許す */
async function writableSession() {
  const client = await createServerBackendClient({ writableCookies: true });
  await getBackendIdentity(client, "store_staff");
  const { data, error } = await client.from("store_members").select("store_id").limit(1);
  if (error) throw new BackendError("connection_failed");
  const storeId = data?.[0]?.store_id as string | undefined;
  if (!storeId) throw new BackendError("forbidden");
  return { client, storeId };
}

export type SaveDiscountResult = {
  product_id: string;
  discount_percent: number | null;
  /** 今回新しく作った設定。停止だけの場合は null */
  offer_id: string | null;
  stopped: number;
};

/**
 * 商品の値引き率を保存する。percent が null なら停止だけ行う。
 * 他店の商品は store_products に無いので、その時点で弾かれる。
 */
export async function saveProductDiscount(
  productId: string,
  percent: number | null,
): Promise<ActionResult<SaveDiscountResult>> {
  if (percent !== null && (!Number.isInteger(percent) || percent < 1 || percent > 90)) {
    return { ok: false, code: "invalid_argument", message: "値引き率は1〜90の整数で入力してください。" };
  }

  try {
    const { client, storeId } = await writableSession();

    // 自店の取扱商品かを先に確かめる。他店の商品はここで0件になる。
    const { data: storeProduct, error: storeProductError } = await client
      .from("store_products")
      .select("product_id, price, is_active")
      .eq("store_id", storeId)
      .eq("product_id", productId)
      .limit(1);
    if (storeProductError) throw storeProductError;
    const target = storeProduct?.[0];
    if (!target) {
      return { ok: false, code: "not_staff", message: "この商品は自店の取扱商品ではありません。" };
    }
    if (!target.is_active) {
      return { ok: false, code: "invalid_state", message: "この商品は現在取り扱いが停止されています。" };
    }

    const { data: active, error: activeError } = await client
      .from("store_offers")
      .select("id, discount_percent")
      .eq("store_id", storeId)
      .eq("product_id", productId)
      .eq("kind", "guerrilla_coupon")
      .eq("status", "active")
      .is("trigger_product_id", null);
    if (activeError) throw activeError;
    const current = active ?? [];

    // 同じ値引き率がすでに有効なら何もしない。保存を二度押しても版が増えない。
    if (percent !== null && current.length === 1 && num(current[0].discount_percent) === percent) {
      return {
        ok: true,
        data: { product_id: productId, discount_percent: percent, offer_id: current[0].id as string, stopped: 0 },
      };
    }

    // 必ず停止が先。両方 active だと App は大きい値引きを採用してしまう。
    if (current.length > 0) {
      const { error: stopError } = await client
        .from("store_offers")
        .update({ status: "inactive" })
        .in("id", current.map((row) => row.id as string));
      if (stopError) throw stopError;
    }

    if (percent === null) {
      return {
        ok: true,
        data: { product_id: productId, discount_percent: null, offer_id: null, stopped: current.length },
      };
    }

    const { data: product, error: productError } = await client
      .from("products")
      .select("name")
      .eq("id", productId)
      .limit(1);
    if (productError) throw productError;
    const name = (product?.[0]?.name as string | undefined) ?? "対象商品";
    const suffix = ` ${percent}%OFF`;
    const headline = `${name.slice(0, HEADLINE_MAX - suffix.length)}${suffix}`;

    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + DEFAULT_DAYS * 24 * 60 * 60 * 1000);
    const { data: created, error: insertError } = await client
      .from("store_offers")
      .insert({
        store_id: storeId,
        kind: "guerrilla_coupon",
        product_id: productId,
        trigger_product_id: null,
        discount_percent: percent,
        headline,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: "active",
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    return {
      ok: true,
      data: {
        product_id: productId,
        discount_percent: percent,
        offer_id: created.id as string,
        stopped: current.length,
      },
    };
  } catch (error) {
    return actionFailure(error);
  }
}
