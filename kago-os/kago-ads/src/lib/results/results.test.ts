import { describe, expect, it } from "vitest";
import { createSeed } from "../../data/demo/seed";
import { addDays, dayEnd, dayStart, today } from "../domain/rules";
import { createMockRepository, memoryStorage } from "../data/mock-repository";
import { PermissionError } from "../data/repository";
import type { DisclosureMetric, Session } from "../domain/types";
import { createMockResultsRepository } from "./mock-results";
import {
  discloseAppRow,
  rate,
  summarizeApp,
  summarizeSignage,
  type AppMetricsRow,
  type ResultPlacement,
  type SignageMetricsRow,
} from "./results";

const ALL: DisclosureMetric[] = ["impressions", "clicks", "cart_adds", "purchases", "signage_views"];
const placement = (scope: DisclosureMetric[] = ALL): ResultPlacement => ({
  id: "PL1", store_id: "S1", store_name: "広島デモ店", call_title: "C1", product_name: "トマトパスタソース", headline: "h",
  version: 2, channels: ["app", "signage"], starts_at: "", ends_at: "", status: "active", disclosure_scope: scope,
});
// 共通仕様書 11.3 のメーカー広告
const app113: AppMetricsRow = {
  store_id: "S1", data_origin: "operated", ad_placement_id: "PL1", impressions: 2, shown_visits: 2, clicks: 1,
  recommendation_adds: 1, adds_after_impression: 1, recommendation_removes: 0, purchases: 1, purchased_quantity: 1,
  purchase_amount: 298, small_sample: true,
};
// 共通仕様書 11.4（カメラ未採用）
const signage114: SignageMetricsRow = {
  store_id: "S1", data_origin: "operated", device_id: "D1", hour_start: "2026-10-25T17:00:00+09:00", ad_placement_id: "PL1",
  plays: 20, play_seconds: 300, measured_plays: 0, not_measured_plays: 20, error_plays: 0,
  estimated_viewers: null, estimated_view_seconds: null, reference_sales_quantity: 1,
};

describe("ADS-04 成果のまとめ方と状態の区別（共通仕様書 9.2〜9.4）", () => {
  it("11.3：実表示2・クリック1（50%）・購入1（50%）・298円、表示来店2なので少数", () => {
    const [s] = summarizeApp(placement(), [app113]);
    expect(s).toMatchObject({ origin: "operated", impressions: 2, shownVisits: 2, clicks: 1, recommendationAdds: 1, purchases: 1, purchaseAmount: 298, smallSample: true });
    expect(rate(s.clicks, s.impressions)).toBe(50);
    expect(rate(s.purchases, s.impressions)).toBe(50);
  });

  it("0件：記録がなければ公開範囲の指標は 0。少数の注記は付けない", () => {
    const [s] = summarizeApp(placement(), []);
    expect(s).toMatchObject({ impressions: 0, clicks: 0, purchases: 0, purchaseAmount: 0, smallSample: false });
    expect(rate(s.clicks, s.impressions)).toBeNull();
  });

  it("非公開：公開範囲の外の指標は 0 にせず null（非公開）。DB が null にした指標も非公開", () => {
    const scope: DisclosureMetric[] = ["impressions", "clicks"];
    const [s] = summarizeApp(placement(scope), [discloseAppRow(app113, scope)]);
    expect(s).toMatchObject({ impressions: 2, clicks: 1, recommendationAdds: null, purchases: null, purchaseAmount: null });
    const [masked] = summarizeApp(placement(ALL), [{ ...app113, purchases: null }]);
    expect(masked.purchases).toBeNull();
    expect(rate(masked.purchases, masked.impressions)).toBeNull();
  });

  it("DB-09 と同じく、表示数を公開しなければ少数の判定も出さない", () => {
    expect(discloseAppRow(app113, ["purchases"]).small_sample).toBeNull();
    expect(discloseAppRow({ ...app113, shown_visits: 5 }, ["impressions"]).small_sample).toBe(false);
  });

  it("事前投入・模擬は実測と分けて、データの由来ごとにまとめる", () => {
    const seeded = { ...app113, data_origin: "seeded" as const, impressions: 12, shown_visits: 9 };
    const rows = summarizeApp(placement(), [app113, seeded, { ...app113, impressions: 3 }]);
    expect(rows.map((r) => [r.origin, r.impressions, r.smallSample])).toEqual([["operated", 5, true], ["seeded", 12, false]]);
  });

  it("11.4：20回・300秒。カメラ未採用なら推定視認は 0 ではなく未計測。同時間帯の販売は参考で1", () => {
    const [s] = summarizeSignage(placement(), [signage114]);
    expect(s).toMatchObject({ plays: 20, playSeconds: 300, measuredPlays: 0, estimatedViewers: "unmeasured", estimatedViewSeconds: "unmeasured", referenceSales: 1 });
  });

  it("計測した再生があれば推定値を出す。計測した 0 人は 0（未計測ではない）", () => {
    const [s] = summarizeSignage(placement(), [{ ...signage114, measured_plays: 4, estimated_viewers: 0, estimated_view_seconds: 0 }]);
    expect(s).toMatchObject({ estimatedViewers: 0, estimatedViewSeconds: 0 });
    expect(rate(s.measuredPlays, s.plays)).toBe(20);
  });

  it("Signage の再生を公開していなければ非公開、購入を公開していなければ販売数も非公開", () => {
    const [hidden] = summarizeSignage(placement(["impressions"]), []);
    expect(hidden).toMatchObject({ plays: null, estimatedViewers: null, referenceSales: null });
    const [noSales] = summarizeSignage(placement(["signage_views"]), [{ ...signage114, reference_sales_quantity: null }]);
    expect(noSales).toMatchObject({ plays: 20, referenceSales: null });
  });
});

describe("ADS-04 仮データ版（2メーカー・公開可／不可・App／Signage）", () => {
  const maker1: Session = { role: "maker_staff", makerId: "M1" };
  const maker2: Session = { role: "maker_staff", makerId: "M2" };
  const period = (from: number, to: number) => ({ start: dayStart(addDays(today(), from)), end: dayEnd(addDays(today(), to)) });
  const repoWith = (scope?: DisclosureMetric[]) =>
    createMockResultsRepository(createMockRepository(memoryStorage(), () => {
      const db = createSeed();
      if (scope) db.ad_calls.find((c) => c.id === "C1")!.disclosure_scope = scope;
      return db;
    }));

  it("M1 は PL1 の 11.3・11.4 の値と、事前投入の行を見られる", async () => {
    const r = await repoWith().listMakerResults(maker1, period(-30, 0));
    expect(r.placements.map((p) => [p.id, p.product_name, p.version])).toEqual([["PL1", "トマトパスタソース", 2]]);
    const app = summarizeApp(r.placements[0], r.app);
    expect(app.map((a) => [a.origin, a.impressions, a.purchaseAmount])).toEqual([["operated", 2, 298], ["seeded", 12, 596]]);
    expect(summarizeSignage(r.placements[0], r.signage)[0]).toMatchObject({ plays: 20, estimatedViewers: "unmeasured" });
  });

  it("期間の外の記録は出さない（その期間は 0 件）", async () => {
    const r = await repoWith().listMakerResults(maker1, period(1, 5));
    expect(r.app).toEqual([]);
    expect(summarizeApp(r.placements[0], r.app)[0]).toMatchObject({ impressions: 0, smallSample: false });
  });

  it("店舗が公開範囲を絞ると、メーカーには非公開の指標が null で届く", async () => {
    const r = await repoWith(["impressions", "clicks"]).listMakerResults(maker1, period(-30, 0));
    expect(r.app.every((a) => a.purchases === null && a.recommendation_adds === null)).toBe(true);
    expect(r.signage.every((s) => s.plays === null)).toBe(true);
  });

  it("別のメーカーには M1 の広告も集計も見えない。店舗の担当者は使えない", async () => {
    expect(await repoWith().listMakerResults(maker2, period(-30, 0))).toEqual({ placements: [], app: [], signage: [] });
    await expect(repoWith().listMakerResults({ role: "store_staff", storeId: "S1" }, period(-30, 0))).rejects.toBeInstanceOf(PermissionError);
  });
});
