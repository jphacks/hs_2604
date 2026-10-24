import { describe, expect, it } from "vitest";
import { validateAsset } from "./media";
import {
  callPhase,
  canApplyTo,
  canResubmit,
  dateOf,
  dayEnd,
  dayStart,
  deliveryState,
  filterAdCalls,
  validateApplication,
  validateApprovalChannels,
  validateReviewComment,
} from "./rules";
import type { AdApplication, AdCall, AdPlacement, CreativeVersion } from "./types";

const at = (date: string, hm = "12:00") => new Date(`${date}T${hm}:00+09:00`);

const base: AdCall = {
  id: "C1", store_id: "S1", title: "t", categories: ["乾麺"], channels: ["app", "signage"],
  starts_at: dayStart("2026-10-10"), ends_at: dayEnd("2026-10-31"), status: "open",
  disclosure_scope: [], description: "d", created_at: "", updated_at: "",
};

describe("callPhase / canApplyTo（共通仕様書 6：closed 後は新規申請を受け付けない）", () => {
  it("期間と状態から段階を決める", () => {
    expect(callPhase(base, at("2026-10-20"))).toBe("open");
    expect(callPhase(base, at("2026-10-01"))).toBe("upcoming");
    expect(callPhase(base, at("2026-11-01"))).toBe("ended");
    expect(callPhase({ ...base, status: "closed" }, at("2026-10-20"))).toBe("closed");
    expect(callPhase({ ...base, status: "draft" }, at("2026-10-20"))).toBe("draft");
  });
  it("最終日の夜までは申請でき、翌日は申請できない（日本時間）", () => {
    expect(canApplyTo(base, at("2026-10-31", "23:30"))).toBe(true);
    expect(canApplyTo(base, at("2026-11-01", "00:10"))).toBe(false);
    expect(canApplyTo({ ...base, status: "closed" }, at("2026-10-20"))).toBe(false);
  });
  it("日本時間の日付で表示する", () => {
    expect(dateOf("2026-10-23T22:00:00Z")).toBe("2026-10-24");
  });
});

describe("validateApplication", () => {
  const version: CreativeVersion = {
    id: "v1", creative_id: "CR1", version: 1, headline: "h", note: "", created_at: "",
    assets: { app: { kind: "image", path: "", width: 800, height: 800, bytes: 1, file_name: "" } },
  };
  it("募集していない掲載先・期間外を拒否する", () => {
    const errors = validateApplication({ ...base, channels: ["app"] }, version, { requested_start: dayStart("2026-10-05"), requested_end: dayEnd("2026-10-20"), channels: ["signage"] }, at("2026-10-15"));
    expect(errors.join()).toContain("Signage を募集していません");
    expect(errors.join()).toContain("掲載期間");
  });
  it("Signage の素材がない版で Signage に申請できない", () => {
    const errors = validateApplication(base, version, { requested_start: dayStart("2026-10-12"), requested_end: dayEnd("2026-10-20"), channels: ["signage"] }, at("2026-10-15"));
    expect(errors.join()).toContain("Signage 用の素材がありません");
  });
  it("正しい入力なら空", () => {
    expect(validateApplication(base, version, { requested_start: dayStart("2026-10-12"), requested_end: dayEnd("2026-10-20"), channels: ["app"] }, at("2026-10-15"))).toEqual([]);
  });
});

describe("審査の入力", () => {
  it("却下・停止の理由は必須・200字以内", () => {
    expect(validateReviewComment(" ")).toHaveLength(1);
    expect(validateReviewComment("あ".repeat(201)).join()).toContain("200字以内");
    expect(validateReviewComment("商品名を大きくしてください")).toEqual([]);
  });
  it("承認する掲載先は申請の一部（1つ以上）", () => {
    expect(validateApprovalChannels(["app", "signage"], ["app"])).toEqual([]);
    expect(validateApprovalChannels(["app"], ["signage"]).length).toBe(1);
    expect(validateApprovalChannels(["app"], []).length).toBe(1);
  });
});

describe("canResubmit", () => {
  const app = (status: AdApplication["status"]) => ({ status }) as AdApplication;
  it("審査中は再申請できず、却下後・承認後はできる", () => {
    expect(canResubmit(app("submitted"))).toBe(false);
    expect(canResubmit(app("rejected"))).toBe(true);
    expect(canResubmit(app("approved"))).toBe(true);
  });
});

describe("deliveryState（配信対象から掲載先ごとの配信の状態）", () => {
  const pl = (over: Partial<AdPlacement>): AdPlacement => ({
    id: "PL", application_id: "A1", store_id: "S1", creative_version_id: "v1", channels: ["app"],
    starts_at: dayStart("2026-10-12"), ends_at: dayEnd("2026-10-20"), status: "active", approved_by: "", approved_at: "", ...over,
  });
  it("期間前・期間中・期間後・承認なし", () => {
    expect(deliveryState([pl({})], "app", at("2026-10-11")).state).toBe("scheduled");
    expect(deliveryState([pl({})], "app", at("2026-10-15")).state).toBe("delivering");
    expect(deliveryState([pl({})], "app", at("2026-10-21")).state).toBe("ended");
    expect(deliveryState([pl({})], "signage", at("2026-10-15")).state).toBe("none");
  });
  it("掲載先を絞って承認した場合、絞った側だけ配信する", () => {
    const list = [pl({ channels: ["app"] })];
    expect(deliveryState(list, "app", at("2026-10-15")).state).toBe("delivering");
    expect(deliveryState(list, "signage", at("2026-10-15")).state).toBe("none");
  });
  it("停止・置き換え済みは配信しない", () => {
    expect(deliveryState([pl({ status: "suspended" })], "app", at("2026-10-15")).state).toBe("suspended");
    expect(deliveryState([pl({ status: "superseded" }), pl({ id: "PL2", creative_version_id: "v2" })], "app", at("2026-10-15")).placement?.id).toBe("PL2");
  });
});

describe("filterAdCalls（ADS-01 の絞り込み）", () => {
  const list: AdCall[] = [
    base,
    { ...base, id: "C2", categories: ["パン"], channels: ["signage"] },
    { ...base, id: "C3", status: "draft" },
    { ...base, id: "C4", ends_at: dayEnd("2026-10-12") },
  ];
  const f = { keyword: "", category: "", channel: "" as const, storeId: "", date: "", includeEnded: false };
  const now = at("2026-10-20");
  it("下書きと終了済みは出さない", () => {
    expect(filterAdCalls(list, f, now).map((c) => c.id)).toEqual(["C1", "C2"]);
  });
  it("終了済みを含める指定、カテゴリ・掲載先・日付で絞れる", () => {
    expect(filterAdCalls(list, { ...f, includeEnded: true }, now).map((c) => c.id)).toContain("C4");
    expect(filterAdCalls(list, { ...f, category: "パン" }, now).map((c) => c.id)).toEqual(["C2"]);
    expect(filterAdCalls(list, { ...f, channel: "app" }, now).map((c) => c.id)).toEqual(["C1"]);
    expect(filterAdCalls(list, { ...f, includeEnded: true, date: "2026-10-25" }, now).map((c) => c.id)).not.toContain("C4");
  });
});

describe("validateAsset（素材の仕様）", () => {
  it("App に動画は使えず、サイズ・容量・長さを確認する", () => {
    expect(validateAsset({ type: "video/mp4", bytes: 1, width: 1920, height: 1080, durationSec: 10 }, "signage")).toEqual([]);
    expect(validateAsset({ type: "video/mp4", bytes: 1, width: 800, height: 800, durationSec: 10 }, "app").join()).toContain("Signage だけ");
    expect(validateAsset({ type: "video/mp4", bytes: 1, width: 1920, height: 1080, durationSec: 16 }, "signage").join()).toContain("15 秒以内");
    expect(validateAsset({ type: "image/png", bytes: 3 * 1024 * 1024, width: 800, height: 800 }, "app").join()).toContain("2MB 以下");
    expect(validateAsset({ type: "image/png", bytes: 1, width: 1000, height: 800 }, "app").join()).toContain("800×800");
  });
});
