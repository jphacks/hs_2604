import { beforeEach, describe, expect, it } from "vitest";
import { addDays, dayEnd, dayStart, latestRevision, today } from "../domain/rules";
import type { Session } from "../domain/types";
import { createMockRepository, memoryStorage } from "./mock-repository";
import { PermissionError, ValidationError, type AdsRepository } from "./repository";
import { createSeed } from "../../data/demo/seed";

const storeA: Session = { role: "store_staff", storeId: "S1" };
const storeB: Session = { role: "store_staff", storeId: "S2" };
const maker1: Session = { role: "maker_staff", makerId: "M1" };
const maker2: Session = { role: "maker_staff", makerId: "M2" };
const reviewerA: Session = { role: "store_staff", storeId: "S1" };
const reviewerB: Session = { role: "store_staff", storeId: "S2" };

// 仮データの日付は今日が基準。テストも今日を基準にする
const d = (n: number) => addDays(today(), n);

let repo: AdsRepository;
beforeEach(() => {
  repo = createMockRepository(memoryStorage(), () => createSeed());
});

const callInput = {
  title: "新しい募集", categories: ["乾麺"], channels: ["app" as const, "signage" as const],
  starts_at: dayStart(d(0)), ends_at: dayEnd(d(30)), description: "説明", disclosure_scope: ["impressions" as const],
};
const appInput = (version = "CR1-v2", channels: ("app" | "signage")[] = ["app", "signage"]) => ({
  creative_version_id: version, channels, requested_start: dayStart(d(1)), requested_end: dayEnd(d(10)), message: "",
});

describe("ADS-02 募集の作成・公開・終了", () => {
  it("作成すると下書き、公開でポータルに出て、終了すると新規申請できない", async () => {
    const c = await repo.saveAdCall(storeA, callInput);
    expect(c.status).toBe("draft");
    expect(c.disclosure_scope).toEqual(["impressions"]);
    expect((await repo.listPublicAdCalls()).some((x) => x.id === c.id)).toBe(false);
    await repo.setAdCallStatus(storeA, c.id, "open");
    expect((await repo.listPublicAdCalls()).some((x) => x.id === c.id)).toBe(true);
    await repo.setAdCallStatus(storeA, c.id, "closed");
    await expect(repo.submitApplication(maker1, c.id, appInput())).rejects.toThrow("終了");
  });

  it("他店舗の募集は変更できず、下書きは他店舗やメーカーから見えない", async () => {
    await expect(repo.setAdCallStatus(storeB, "C1", "closed")).rejects.toBeInstanceOf(PermissionError);
    await expect(repo.saveAdCall(storeB, callInput, "C1")).rejects.toBeInstanceOf(PermissionError);
    expect(await repo.getAdCall(maker1, "C5")).toBeUndefined();
    expect(await repo.getAdCall(storeB, "C5")).toBeUndefined();
    expect((await repo.getAdCall(storeA, "C5"))?.id).toBe("C5");
  });

  it("メーカーは募集を作れず、入力が足りないと保存しない", async () => {
    await expect(repo.saveAdCall(maker1, callInput)).rejects.toBeInstanceOf(PermissionError);
    await expect(repo.saveAdCall(storeA, { ...callInput, channels: [] })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("ADS-03 申請・審査・再申請（共通仕様書 11.2 の流れ）", () => {
  it("申請は submitted になり、店舗の審査画面に出る", async () => {
    // C4 は3日後から。希望期間を募集期間の中にする
    const app = await repo.submitApplication(maker1, "C4", { ...appInput("CR1-v2", ["app"]), requested_start: dayStart(d(4)), requested_end: dayEnd(d(20)) });
    expect(app.status).toBe("submitted");
    expect(app.store_id).toBe("S2");
    expect((await repo.devListStoreApplications(reviewerB)).some((a) => a.id === app.id)).toBe(true);
  });

  it("掲載先を絞って承認すると、絞った掲載先だけの配信対象ができる", async () => {
    const app = await repo.submitApplication(maker1, "C1", { ...appInput(), creative_version_id: "CR1-v1" }).catch(() => null);
    expect(app).toBeNull(); // C1 には CR1 で申請済み
    const created = await repo.createCreative(maker1, {
      product_id: "prod-2900000000100", headline: "見出し", note: "",
      assets: { app: { kind: "image", path: "/x.png", width: 800, height: 800, bytes: 1, file_name: "x.png" }, signage: { kind: "image", path: "/y.png", width: 1920, height: 1080, bytes: 1, file_name: "y.png" } },
    });
    const a = await repo.submitApplication(maker1, "C1", appInput(created.versions[0].id));
    const pl = await repo.devApprove(reviewerA, a.id, { channels: ["app"], starts_at: dayStart(d(1)), ends_at: dayEnd(d(10)) });
    expect(pl.channels).toEqual(["app"]);
    expect((await repo.getApplication(maker1, a.id))?.status).toBe("approved");
    await expect(repo.devApprove(reviewerA, a.id, { channels: ["app"], starts_at: dayStart(d(1)), ends_at: dayEnd(d(10)) })).rejects.toThrow("すでに審査済み");
  });

  it("却下には理由が必要で、却下後は新しい版で再申請でき、前の回の結果が残る", async () => {
    await expect(repo.devReject(reviewerA, "A2", "")).rejects.toBeInstanceOf(ValidationError);
    await repo.devReject(reviewerA, "A2", "画像が暗いので明るくしてください");
    const v3 = await repo.addCreativeVersion(maker1, "CR1", {
      headline: "ゆでたパスタに、かけるだけ。", note: "明るくした",
      assets: { signage: { kind: "image", path: "/z.png", width: 1920, height: 1080, bytes: 1, file_name: "z.png" } },
    });
    expect(v3.version).toBe(3);
    const app = await repo.resubmitApplication(maker1, "A2", { ...appInput(v3.id, ["signage"]) });
    expect(app.status).toBe("submitted");
    expect(app.revisions).toHaveLength(2);
    expect(app.revisions[0].review_comment).toBe("画像が暗いので明るくしてください");
    expect(latestRevision(app).creative_version_id).toBe(v3.id);
    await expect(repo.resubmitApplication(maker1, "A2", appInput(v3.id, ["signage"]))).rejects.toThrow("審査中");
  });

  it("承認後の素材差し替え：新しい版を承認するまで旧版の配信対象は active、承認で superseded", async () => {
    const v3 = await repo.addCreativeVersion(maker1, "CR1", {
      headline: "h", note: "", assets: { app: { kind: "image", path: "/a.png", width: 800, height: 800, bytes: 1, file_name: "a.png" } },
    });
    await repo.resubmitApplication(maker1, "A1", appInput(v3.id, ["app"]));
    expect((await repo.listPlacements(maker1, "A1")).find((p) => p.id === "PL1")?.status).toBe("active");
    await repo.devApprove(reviewerA, "A1", { channels: ["app"], starts_at: dayStart(d(1)), ends_at: dayEnd(d(10)) });
    const pls = await repo.listPlacements(maker1, "A1");
    expect(pls.find((p) => p.id === "PL1")?.status).toBe("superseded");
    expect(pls.filter((p) => p.status === "active")).toHaveLength(1);
  });

  it("停止は配信対象に対して行い、理由が必要", async () => {
    await expect(repo.devSuspend(reviewerA, "PL1", "")).rejects.toBeInstanceOf(ValidationError);
    const p = await repo.devSuspend(reviewerA, "PL1", "棚替えのため");
    expect(p.status).toBe("suspended");
    await expect(repo.devSuspend(reviewerB, "PL1", "x")).rejects.toBeInstanceOf(PermissionError);
  });

  it("他社・他店の申請と配信対象は見えず、メーカーは審査できない", async () => {
    expect(await repo.getApplication(maker2, "A1")).toBeUndefined();
    expect(await repo.listPlacements(maker2, "A1")).toEqual([]);
    expect(await repo.getApplication(reviewerB, "A1")).toBeUndefined();
    await expect(repo.devReject(maker1, "A2", "x")).rejects.toBeInstanceOf(PermissionError);
    await expect(repo.devApprove(reviewerB, "A2", { channels: ["signage"], starts_at: dayStart(d(1)), ends_at: dayEnd(d(5)) })).rejects.toBeInstanceOf(PermissionError);
  });

  it("他社の素材では申請できず、同じ募集に同じ素材で二重に申請できない", async () => {
    await expect(repo.submitApplication(maker2, "C4", appInput("CR1-v2", ["app"]))).rejects.toBeInstanceOf(PermissionError);
    await expect(repo.submitApplication(maker1, "C1", appInput())).rejects.toThrow("すでに");
  });
});
