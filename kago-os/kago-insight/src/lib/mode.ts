/**
 * データの取得先。モックと共通DBを切り替える唯一のスイッチ。
 *
 * .env.local の NEXT_PUBLIC_INSIGHT_DATA_SOURCE で指定する。
 *   supabase … 共通DBを見る（既定）
 *   mock     … src/data/mock の固定JSONを見る
 *
 * kago-ads の NEXT_PUBLIC_ADS_DATA_SOURCE と同じ考え方で揃えてある。
 * クライアント側の表示（モック中バッジ）でも読むので server-only は付けない。
 */
export type InsightDataSource = "mock" | "supabase";

export const DATA_SOURCE: InsightDataSource =
  process.env.NEXT_PUBLIC_INSIGHT_DATA_SOURCE === "mock" ? "mock" : "supabase";

export const USING_MOCK = DATA_SOURCE === "mock";
