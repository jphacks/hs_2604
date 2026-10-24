import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHeadlessBackend, signInBackend, signOutBackend } from "@kago/backend";
import { createPortalDatabase, fixturePassword, id, users } from "../../../tests/fixtures/portal-database.mts";
import { createSupabaseStoreCallsRepository, requireStore } from "./store-calls";
import { createSupabasePortalRepository } from "./portal";
import { getAdsIdentity } from "./ads-identity";
import { canApplyTo } from "../domain/rules";
import type { AdCallInput } from "../data/repository";
const session = { role: "store_staff", storeId: id(1) } as const;
const input = (title: string): AdCallInput => ({
  title, categories: ["パン"], channels: ["app", "signage"], starts_at: "2099-01-01T00:00:00+09:00",
  ends_at: "2099-02-01T00:00:00+09:00", description: "架空店舗の募集", disclosure_scope: ["impressions", "signage_views"],
});
describe("ADS-02 正式SQL・RLSによる募集の保存", () => {
  let fixture: Awaited<ReturnType<typeof createPortalDatabase>>;
  beforeAll(async () => { fixture = await createPortalDatabase(); }, 30_000);
  afterAll(async () => { await fixture?.close(); });
  async function client(n = 104) {
    const c = createHeadlessBackend({ url: "https://fixture.supabase.co", publishableKey: "sb_publishable_fixture" }, fixture.fetcher);
    await signInBackend(c, users.find((u) => u.n === n)!.email, fixturePassword);
    return c;
  }
  it("店舗の役割と所属を解決し、自店舗の下書きも読める", async () => {
    const c = await client();
    expect(await requireStore(c)).toEqual({ userId: id(104), storeIds: [id(1)] });
    const identity = await getAdsIdentity(c, "store_staff");
    expect(identity.role).toBe("store_staff");
    const repo = createSupabaseStoreCallsRepository(c);
    expect((await repo.listMyAdCalls(session)).map((r) => r.id).sort()).toEqual([id(31), id(32), id(33)]);
    expect((await repo.getAdCall(session, id(33)))?.status).toBe("draft");
    expect(await repo.getAdCall(session, id(34))).toBeUndefined();
  });
  it("所属のない店舗役割、メーカー、消費者を拒否する", async () => {
    for (const n of [108, 101, 105]) {
      await expect(requireStore(await client(n))).rejects.toMatchObject({ code: "forbidden" });
    }
  });
  it("複数所属でも指定した店舗に限定し、所属外のIDを拒否する", async () => {
    const c = await client(110);
    expect((await requireStore(c)).storeIds.sort()).toEqual([id(1), id(2)]);
    const repo = createSupabaseStoreCallsRepository(c);
    expect((await repo.listMyAdCalls({ role: "store_staff", storeId: id(2) })).map((r) => r.id)).toEqual([id(34)]);
    await expect(repo.listMyAdCalls({ role: "store_staff", storeId: id(999) })).rejects.toMatchObject({ code: "forbidden" });
  });
  it("本人の店舗に下書きを作り、期間・UUID・公開範囲を保存する", async () => {
    const repo = createSupabaseStoreCallsRepository(await client());
    const saved = await repo.saveAdCall(session, { ...input("新しい下書き"), store_id: id(2), status: "open" } as AdCallInput);
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(saved.store_id).toBe(id(1));
    expect(saved.status).toBe("draft");
    expect(saved.disclosure_scope).toEqual(["impressions", "signage_views"]);
    expect(Date.parse(saved.ends_at)).toBe(Date.parse("2099-02-01T00:00:00+09:00"));
  });
  it("公開すると別メーカーから見え、終了後は申請不可・変更不可になる", async () => {
    const repo = createSupabaseStoreCallsRepository(await client());
    const maker = createSupabasePortalRepository(await client(101));
    let saved = await repo.saveAdCall(session, input("公開から終了"));
    expect(await maker.getAdCall({ role: "guest" }, saved.id)).toBeUndefined();
    saved = await repo.setAdCallStatus(session, saved.id, "open", saved.updated_at);
    expect((await maker.getAdCall({ role: "guest" }, saved.id))?.title).toBe("公開から終了");
    saved = await repo.setAdCallStatus(session, saved.id, "closed", saved.updated_at);
    expect(canApplyTo((await maker.getAdCall({ role: "guest" }, saved.id))!)).toBe(false);
    await expect(fixture.asUser(users[0], () => fixture.db.query(
      "insert into ad_applications(ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period) values ($1,$2,$3,$4,$5,array['app'],'[2099-01-01,2099-02-01)')",
      [saved.id, id(1), id(11), id(51), id(53)]))).rejects.toMatchObject({ code: "23514" });
    await expect(repo.setAdCallStatus(session, saved.id, "open")).rejects.toThrow("終了した募集");
    await expect(repo.saveAdCall(session, input("書換え"), saved.id)).rejects.toThrow("終了した募集");
    expect((await fixture.db.query<{ count: number }>("select count(*)::int as count from ad_placements")).rows[0].count).toBe(0);
  });
  it("下書きの条件を編集でき、公開後は期間・媒体だけを固定する", async () => {
    const repo = createSupabaseStoreCallsRepository(await client());
    const draft = await repo.saveAdCall(session, input("編集する募集"));
    const values = { ...input("変更後"), channels: ["signage"] as const, description: "変更後の案内" };
    const edited = await repo.saveAdCall(session, { ...values, channels: [...values.channels] }, draft.id, draft.updated_at);
    const opened = await repo.setAdCallStatus(session, edited.id, "open", edited.updated_at);
    await expect(repo.saveAdCall(session, input("媒体の変更"), opened.id)).rejects.toThrow("公開後は掲載期間");
    await expect(repo.saveAdCall(session, { ...input("期間の変更"), channels: ["signage"], ends_at: "2099-03-01T00:00:00+09:00" }, opened.id)).rejects.toThrow("公開後は掲載期間");
    const updated = await repo.saveAdCall(session, { ...values, channels: ["signage"], disclosure_scope: [] }, opened.id, opened.updated_at);
    expect(updated.disclosure_scope).toEqual([]);
  });
  it("別店舗のIDを指定しても読取・更新を拒否し、SDK直呼びでもRLSが守る", async () => {
    const c = await client(109);
    const other = { role: "store_staff", storeId: id(2) } as const;
    const repo = createSupabaseStoreCallsRepository(c);
    await expect(repo.saveAdCall(other, input("他店の変更"), id(31))).rejects.toMatchObject({ code: "forbidden" });
    await expect(repo.saveAdCall(session, input("偽の所属"))).rejects.toMatchObject({ code: "forbidden" });
    const changed = await c.from("ad_calls").update({ title: "他店の変更" }).eq("id", id(31)).select("id");
    expect(changed.error).toBeNull();
    expect(changed.data).toEqual([]);
    const rejected = await c.from("ad_calls").insert({ ...input("他店へ作成"), store_id: id(1) }).select("id");
    expect(rejected.error?.code).toBe("42501");
  });
  it("古いフォームの保存・状態変更を拒否し、先に保存した内容を保つ", async () => {
    const repo = createSupabaseStoreCallsRepository(await client());
    const row = await repo.saveAdCall(session, input("元の募集"));
    const changed = await repo.saveAdCall(session, input("先の更新"), row.id, row.updated_at);
    await expect(repo.saveAdCall(session, input("古い画面の上書き"), row.id, row.updated_at)).rejects.toThrow("募集が更新されています");
    await expect(repo.setAdCallStatus(session, row.id, "open", row.updated_at)).rejects.toThrow("募集が更新されています");
    expect((await repo.getAdCall(session, row.id))?.title).toBe(changed.title);
  });
  it("別の担当者から同時に保存しても片方だけ成功する", async () => {
    const first = createSupabaseStoreCallsRepository(await client());
    const second = createSupabaseStoreCallsRepository(await client(110));
    const row = await first.saveAdCall(session, input("同時更新"));
    const results = await Promise.allSettled([
      first.saveAdCall(session, input("担当A"), row.id, row.updated_at),
      second.saveAdCall(session, input("担当B"), row.id, row.updated_at),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("メーカーが保存処理を呼んでも拒否し、ログアウト後も保存できない", async () => {
    const maker = createSupabaseStoreCallsRepository(await client(101));
    await expect(maker.saveAdCall(session, input("メーカーから作成"))).rejects.toMatchObject({ code: "forbidden" });
    const c = await client();
    await signOutBackend(c);
    await expect(createSupabaseStoreCallsRepository(c).saveAdCall(session, input("ログアウト後"))).rejects.toMatchObject({ code: "unauthenticated" });
  });
});
