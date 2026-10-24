import "server-only";

/**
 * 画面とデータの境界。画面（Server Component）はこのファイルの関数しか呼ばない。
 *
 * 取得先は mode.ts の NEXT_PUBLIC_INSIGHT_DATA_SOURCE で切り替わる。
 *   supabase … supabase-source.ts（共通DB）
 *   mock     … mock-source.ts（src/data/mock の固定JSON）
 * 引数・戻り値・エラーの形は両方で同じなので、画面は切替を意識しない。
 *
 * 書き込みは actions.ts（Server Action）にある。
 *
 * 対応する DB 側の定義（kago-core/supabase/migrations）
 *   20261024050000_ads_promotions.sql  … DB-04 申請・配信・販促
 *   20261024090000_ad_approval.sql     … DB-08 承認・却下・停止
 *   20261024100000_metric_views.sql    … DB-09 指標
 */
import * as mock from "./mock-source";
import { USING_MOCK } from "./mode";
import * as supabase from "./supabase-source";

const source = USING_MOCK ? mock : supabase;

export const fetchApplications = source.fetchApplications;
export const fetchPlacements = source.fetchPlacements;
export const fetchPromotions = source.fetchPromotions;
export const fetchProducts = source.fetchProducts;
export const fetchAppMetrics = source.fetchAppMetrics;

/** サイネージの再生。placement_type の列は無いので、どちらのIDが入っているかで判別する */
export const fetchSignageMetrics = source.fetchSignageMetrics;

/** 全体の購入値。種別別の値を足さずにここから取る（common-spec 9.1.1） */
export const fetchOrderTotals = source.fetchOrderTotals;

/** 選定枠数。実表示とは別のビュー。由来は unclassified で返る */
export const fetchSelectionCounts = source.fetchSelectionCounts;
