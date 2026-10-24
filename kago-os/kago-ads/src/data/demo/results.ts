// ADS-04 の仮データ版で見せる固定の集計（店舗の内部の値）。メーカーには公開範囲を当ててから見せる
// 値は共通仕様書 11.3（App）・11.4（Signage、17時台・D1）の PL1 の期待値。日付は今日を基準にする
import { addDays, today } from "../../lib/domain/rules";
import type { AppMetricsRow, SignageMetricsRow } from "../../lib/results/results";

/** 期間で絞り込むための時刻（DB-09 では関数の引数の期間で絞る） */
export type DemoAppRow = AppMetricsRow & { at: string };
export type DemoSignageRow = SignageMetricsRow & { at: string };

export function demoResultRows(on: string = today()): { app: DemoAppRow[]; signage: DemoSignageRow[] } {
  const yesterday = addDays(on, -1);
  const at = (date: string, hm: string) => `${date}T${hm}:00+09:00`;
  return {
    app: [
      {
        // 11.3：実表示2・表示来店2・クリック1・提案経由の追加1・削除0・表示後の購入1・298円（少数）
        at: at(yesterday, "17:30"), store_id: "S1", data_origin: "operated", ad_placement_id: "PL1",
        impressions: 2, shown_visits: 2, clicks: 1, recommendation_adds: 1, adds_after_impression: 1,
        recommendation_removes: 0, purchases: 1, purchased_quantity: 1, purchase_amount: 298, small_sample: true,
      },
      {
        // 事前投入（DATA-03 の過去分の例）。実測と分けて表示する
        at: at(addDays(on, -7), "18:00"), store_id: "S1", data_origin: "seeded", ad_placement_id: "PL1",
        impressions: 12, shown_visits: 9, clicks: 3, recommendation_adds: 2, adds_after_impression: 3,
        recommendation_removes: 0, purchases: 2, purchased_quantity: 2, purchase_amount: 596, small_sample: false,
      },
    ],
    signage: [
      {
        // 11.4：PL1 が 20回・300秒。カメラは未採用なので未計測。同時間帯の P-SAUCE の販売は1（参考）
        at: at(yesterday, "17:00"), store_id: "S1", data_origin: "operated", device_id: "D1", hour_start: at(yesterday, "17:00"),
        ad_placement_id: "PL1", plays: 20, play_seconds: 300, measured_plays: 0, not_measured_plays: 20, error_plays: 0,
        estimated_viewers: null, estimated_view_seconds: null, reference_sales_quantity: 1,
      },
    ],
  };
}
