import { beforeEach, describe, expect, it } from "vitest";
import { createSeed, type MockDb } from "../../data/demo/seed";
import { createMockRepository, memoryStorage } from "../data/mock-repository";
import { PermissionError, type AdsRepository } from "../data/repository";
import type { Session, SignagePlay } from "../domain/types";
import { buildFeed, CACHE_TTL_MS, type FeedItem, type SignageFeed } from "./feed";
import { decide, fallbackReason, pickNext, type Playing } from "./player";
import { endPlay, isCountedPlay, startPlay, summarizePlays } from "./plays";

// 共通仕様書 11 章の日（2026-10-25）を基準にする
const DAY = "2026-10-25";
const at = (hm: string) => new Date(`${DAY}T${hm}:00+09:00`);
const seed = () => createSeed(DAY);

function feedFor(db: MockDb, deviceId: string, now: Date, offset = 0): SignageFeed {
  const device = db.signage_devices.find((d) => d.id === deviceId)!;
  return buildFeed(
    {
      device,
      store: db.stores.find((s) => s.id === device.store_id)!,
      placements: db.ad_placements,
      creatives: db.creatives,
      creative_versions: db.creative_versions,
      makers: db.makers,
      products: db.products,
      store_products: db.store_products,
      promotions: db.store_promotions,
    },
    now,
    offset,
  );
}

const keys = (f: SignageFeed) => f.items.map((i) => i.key);
const allReady = () => true;

describe("SIG-01 配信内容", () => {
  it("17時の D1 は、広告 PL1 と販促（優先度順）を交互に並べ、広告表記・価格・理由を持つ", () => {
    const f = feedFor(seed(), "D1", at("17:00"));
    expect(keys(f)).toEqual(["PL1", "SP1-v1", "SP2-v1"]);
    const [pl1, sp1] = f.items;
    expect(pl1).toMatchObject({ placement_type: "sponsored", creative_version_id: "CR1-v2", maker_name: "瀬戸内トマト食品", price: 298 });
    expect(pl1.asset.kind).toBe("video");
    expect(sp1).toMatchObject({ placement_type: "store_promo", product_name: "お店のコロッケ 1個", price: 98, reason_text: "店内で揚げたてです" });
    // SP1 は 16〜19時。19時で出さなくなる
    expect(sp1.valid_until).toBe(new Date(`${DAY}T19:00:00+09:00`).toISOString());
    expect(Date.parse(f.expires_at) - Date.parse(f.fetched_at)).toBe(CACHE_TTL_MS);
  });

  it("曜日が合わない時間帯は出さない（2026-10-25 は日曜＝7）", () => {
    const db = seed();
    db.store_promotions[0].time_windows = [{ weekdays: [1, 2, 3, 4, 5], start: "16:00", end: "19:00" }];
    expect(keys(feedFor(db, "D1", at("17:00")))).not.toContain("SP1-v1");
  });

  it("期間の終わりの時刻ちょうどは期間外（[starts_at, ends_at)）", () => {
    const db = seed();
    db.ad_placements[0].ends_at = at("17:00").toISOString();
    expect(keys(feedFor(db, "D1", at("17:00")))).not.toContain("PL1");
  });

  it("時間帯の外の販促は出さない（10時は SP1 なし）", () => {
    const f = feedFor(seed(), "D1", at("10:00"));
    expect(keys(f)).toEqual(["PL1", "SP2-v1"]);
    expect(f.skipped).toContainEqual({ key: "SP1-v1", reason: "販促の時間帯の外" });
  });

  it("デモ用の時刻（店舗の時刻）で判定する", () => {
    const offset = at("17:00").getTime() - at("10:00").getTime();
    expect(keys(feedFor(seed(), "D1", at("10:00"), offset))).toContain("SP1-v1");
  });

  it("駅前店の端末は自店の分だけ（配信対象も販促もなければ空 → 案内）", () => {
    const f = feedFor(seed(), "D3", at("17:00"));
    expect(f.items).toEqual([]);
    expect(fallbackReason(f, at("17:00").getTime())).toBe("no_content");
  });

  it("停止・期間外・Signage 素材なし・取扱いなしは出さない", () => {
    const db = seed();
    db.ad_placements[0].status = "suspended";
    expect(keys(feedFor(db, "D1", at("17:00")))).not.toContain("PL1");
    expect(feedFor(db, "D1", at("17:00")).suspended_keys).toContain("PL1");

    const db2 = seed();
    db2.ad_placements[0].ends_at = `${DAY}T12:00:00+09:00`;
    expect(feedFor(db2, "D1", at("17:00")).skipped).toContainEqual({ key: "PL1", reason: "配信期間の外" });

    const db3 = seed();
    db3.ad_placements[0].creative_version_id = "CR1-v1";
    delete db3.creative_versions[0].assets.signage;
    expect(feedFor(db3, "D1", at("17:00")).skipped).toContainEqual({ key: "PL1", reason: "Signage 用の素材がない" });

    const db4 = seed();
    db4.store_products.find((p) => p.store_id === "S1" && p.product_id === "prod-PLU-2001")!.is_active = false;
    expect(keys(feedFor(db4, "D1", at("17:00")))).not.toContain("SP1-v1");
  });

  it("App だけに承認された配信対象は Signage に出さない", () => {
    const db = seed();
    db.ad_placements[0].channels = ["app"];
    expect(keys(feedFor(db, "D1", at("17:00")))).not.toContain("PL1");
  });
});

describe("SIG-01・SIG-03 切り替えの判定", () => {
  const t0 = at("17:00").getTime();
  const feed = () => feedFor(seed(), "D1", at("17:00"));
  const playing = (key: string | null, kind: "image" | "video", f: SignageFeed, extra: Partial<Playing> = {}): Playing => ({
    key, kind, startedAtMs: t0, durationSec: kind === "video" ? 10 : undefined, feedKeys: keys(f), videoEnded: false, ...extra,
  });

  it("画像は10秒で次へ。10秒未満は続ける", () => {
    const f = feed();
    const p = playing("SP1-v1", "image", f);
    expect(decide(p, f, t0 + 9_900, allReady)).toEqual({ switch: false });
    expect(decide(p, f, t0 + 10_000, allReady)).toEqual({ switch: true, reason: "completed" });
    expect(pickNext(f, t0 + 10_000, allReady, p)?.key).toBe("SP2-v1");
  });

  it("版が変わったら、画像は3秒以上で切り替え、新しく入ったものを先に出す", () => {
    const before = feed();
    const p = playing("SP2-v1", "image", before);
    const db = seed();
    db.store_promotions.push({ ...db.store_promotions[1], id: "SP3", version_id: "SP3-v1", priority: 80 });
    const after = feedFor(db, "D1", at("17:00"));
    expect(decide(p, after, t0 + 2_000, allReady)).toEqual({ switch: false });
    expect(decide(p, after, t0 + 3_000, allReady)).toEqual({ switch: true, reason: "updated" });
    expect(pickNext(after, t0 + 3_000, allReady, p)?.key).toBe("SP3-v1");
  });

  it("動画は版が変わっても最後まで再生してから切り替える", () => {
    const before = feed();
    const p = playing("PL1", "video", before);
    const db = seed();
    db.store_promotions.pop();
    const after = feedFor(db, "D1", at("17:00"));
    expect(decide(p, after, t0 + 8_000, allReady)).toEqual({ switch: false });
    expect(decide({ ...p, videoEnded: true }, after, t0 + 10_000, allReady)).toEqual({ switch: true, reason: "completed" });
  });

  it("停止は動画の途中でもすぐ切り替える", () => {
    const p = playing("PL1", "video", feed());
    const db = seed();
    db.ad_placements[0].status = "suspended";
    expect(decide(p, feedFor(db, "D1", at("17:00")), t0 + 1_000, allReady)).toEqual({ switch: true, reason: "suspended" });
  });

  it("販促の時間帯が終わったらすぐ切り替える", () => {
    const f = feedFor(seed(), "D1", at("18:59"));
    const p = { ...playing("SP1-v1", "image", f), startedAtMs: at("18:59").getTime() + 55_000 };
    expect(decide(p, f, at("19:00").getTime(), allReady)).toEqual({ switch: true, reason: "expired" });
  });

  it("取得できないまま10分を過ぎたら、広告を出さず案内にする", () => {
    const f = feed();
    const p = playing("SP1-v1", "image", f);
    expect(decide(p, f, t0 + CACHE_TTL_MS - 1_000, allReady).switch).toBe(true); // 10秒は過ぎているので次へ
    expect(pickNext(f, t0 + CACHE_TTL_MS - 1_000, allReady, p)).not.toBeNull();
    expect(decide({ ...p, startedAtMs: t0 + CACHE_TTL_MS - 2_000 }, f, t0 + CACHE_TTL_MS, allReady)).toEqual({ switch: true, reason: "expired" });
    expect(pickNext(f, t0 + CACHE_TTL_MS, allReady, p)).toBeNull();
    expect(fallbackReason(f, t0 + CACHE_TTL_MS)).toBe("cache_expired");
  });

  it("素材を読めないものは飛ばし、全部読めなければ案内", () => {
    const f = feed();
    const ready = (i: FeedItem) => i.key !== "SP1-v1";
    expect(pickNext(f, t0, ready, { key: "PL1", feedKeys: keys(f) })?.key).toBe("SP2-v1");
    expect(pickNext(f, t0, () => false, null)).toBeNull();
    expect(fallbackReason(f, t0)).toBe("media_unavailable");
  });

  it("案内中に出せるものができたらすぐ切り替える", () => {
    const empty = feedFor(seed(), "D3", at("17:00"));
    const p = playing(null, "image", empty);
    expect(decide(p, empty, t0 + 1_000, allReady)).toEqual({ switch: false });
    expect(decide(p, feed(), t0 + 1_000, allReady)).toEqual({ switch: true, reason: "updated" });
  });

  it("再生中のものが一覧から消えたら、元の順で次にあったものを出す", () => {
    const before = feed();
    const db = seed();
    db.store_promotions[0].status = "inactive";
    const after = feedFor(db, "D1", at("17:00"));
    expect(pickNext(after, t0, allReady, { key: "SP1-v1", feedKeys: keys(before) })?.key).toBe("SP2-v1");
  });
});

describe("SIG-02 再生記録の数え方", () => {
  const item = (key: string): FeedItem => feedFor(seed(), "D1", at("17:00")).items.find((i) => i.key === key)!;
  const iso = (sec: number) => new Date(at("17:00").getTime() + sec * 1000).toISOString();
  const play = (key: string, from: number, to: number, reason: SignagePlay["end_reason"] = "completed") =>
    endPlay(startPlay("D1", item(key), "no_content", iso(from)), iso(to), reason!);

  it("共通仕様書 11.4：15秒ずつ20件ずつと、2秒の1件（数えない）→ 各20回・300秒", () => {
    const plays: SignagePlay[] = [];
    for (let i = 0; i < 20; i++) {
      // PL1 は動画なので最後まで再生した扱い。SP1 は画像
      plays.push(play("PL1", i * 30, i * 30 + 15));
      plays.push(play("SP1-v1", i * 30 + 15, i * 30 + 30));
    }
    plays.push(play("PL1", 600, 602, "closed"));
    const rows = summarizePlays(plays);
    expect(rows.find((r) => r.target === "PL1")).toEqual({ target: "PL1", saved: 21, counted: 20, seconds: 300 });
    expect(rows.find((r) => r.target === "SP1-v1")).toEqual({ target: "SP1-v1", saved: 20, counted: 20, seconds: 300 });
  });

  it("途中で止めた動画は3秒以上でも数えない。画像は3秒以上なら更新で切り替えても数える", () => {
    expect(isCountedPlay(play("PL1", 0, 5, "suspended"))).toBe(false);
    expect(isCountedPlay(play("SP1-v1", 0, 3, "updated"))).toBe(true);
    expect(isCountedPlay(play("SP1-v1", 0, 2.9, "updated"))).toBe(false);
  });

  it("案内・終わっていない記録は数えない", () => {
    const fb = endPlay(startPlay("D1", null, "cache_expired", iso(0)), iso(60), "updated");
    expect(fb).toMatchObject({ mode: "fallback", reason_code: "cache_expired", ad_placement_id: null });
    expect(isCountedPlay(fb)).toBe(false);
    expect(isCountedPlay(startPlay("D1", item("SP1-v1"), "no_content", iso(0)))).toBe(false);
  });

  it("記録は配信対象・素材の版・販促の版・理由を持ち、個人の ID を持たない", () => {
    const p = play("PL1", 0, 10);
    expect(p).toMatchObject({ ad_placement_id: "PL1", creative_version_id: "CR1-v2", promotion_version_id: null, reason_code: "approved_order" });
    expect(Object.keys(p)).not.toContain("user_id");
    expect(Object.keys(p)).not.toContain("visit_id");
  });
});

describe("SIG-01・SIG-02 端末の権限と再送", () => {
  let repo: AdsRepository;
  let d1: Session;
  const staff: Session = { role: "store_staff", storeId: "S1" };
  beforeEach(async () => {
    repo = createMockRepository(memoryStorage(), seed);
    d1 = await repo.signInDevice("D1");
  });

  it("端末は自店の配信内容だけを読め、Ads の画面のデータや他店の記録は扱えない", async () => {
    expect(d1).toEqual({ role: "signage", deviceId: "D1", storeId: "S1" });
    const f = await repo.getSignageFeed(d1, at("17:00"));
    expect(f.device.id).toBe("D1");
    await expect(repo.listMyAdCalls(d1)).rejects.toBeInstanceOf(PermissionError);
    await expect(repo.devListPlays(d1)).rejects.toBeInstanceOf(PermissionError);
    await expect(repo.listMyApplications(d1)).rejects.toBeInstanceOf(PermissionError);
    await expect(repo.getSignageFeed(staff)).rejects.toBeInstanceOf(PermissionError);
    await expect(repo.signInDevice("D9")).rejects.toBeInstanceOf(PermissionError);
  });

  it("終わった記録だけを保存し、同じ記録を再送しても1件・受信時刻も変わらない", async () => {
    const f = await repo.getSignageFeed(d1, at("17:00"));
    const started = startPlay("D1", f.items[1], "no_content", at("17:00").toISOString(), "play-1");
    const ended = endPlay(started, new Date(at("17:00").getTime() + 10_000).toISOString(), "completed");
    await expect(repo.recordPlays(d1, [started])).rejects.toThrow("終わっていない");
    await repo.recordPlays(d1, [ended]);
    const first = (await repo.devListPlays(staff))[0].received_at;
    await repo.recordPlays(d1, [ended]);
    const plays = await repo.devListPlays(staff);
    expect(plays).toHaveLength(1);
    expect(plays[0]).toMatchObject({ id: "play-1", end_reason: "completed", promotion_version_id: "SP1-v1", received_at: first });
    expect(summarizePlays(plays)[0]).toMatchObject({ counted: 1, seconds: 10 });
  });

  it("他の端末の記録は保存できない。他店の担当者には見えない", async () => {
    const f = await repo.getSignageFeed(d1, at("17:00"));
    const done = (dev: string) => endPlay(startPlay(dev, f.items[0], "no_content", at("17:00").toISOString()), at("17:01").toISOString(), "completed");
    await expect(repo.recordPlays(d1, [done("D3")])).rejects.toBeInstanceOf(PermissionError);
    await repo.recordPlays(d1, [done("D1")]);
    expect(await repo.devListPlays({ role: "store_staff", storeId: "S2" })).toEqual([]);
  });

  it("店舗の担当者が販促を止めると、次の取得で一覧から消え停止として届く", async () => {
    await repo.devSetPromotionStatus(staff, "SP1", "inactive");
    const f = await repo.getSignageFeed(d1, at("17:00"));
    expect(f.items.map((i) => i.key)).not.toContain("SP1-v1");
    expect(f.suspended_keys).toContain("SP1-v1");
    await expect(repo.devSetPromotionStatus({ role: "store_staff", storeId: "S2" }, "SP2", "inactive")).rejects.toBeInstanceOf(PermissionError);
  });

  it("デモ用の時刻を設定すると、端末の配信内容がその時刻で決まる", async () => {
    await repo.devSetDemoTime(staff, at("17:30").toISOString());
    const f = await repo.getSignageFeed(d1);
    expect(f.clock_offset_ms).not.toBe(0);
    expect(f.items.map((i) => i.key)).toContain("SP1-v1");
    await repo.devSetDemoTime(staff, null);
    expect(await repo.devGetClockOffset(staff)).toBe(0);
  });
});
