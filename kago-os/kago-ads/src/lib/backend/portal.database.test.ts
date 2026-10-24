import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHeadlessBackend, signInBackend, signOutBackend } from "@kago/backend";
import { createPortalDatabase, fixturePassword, id, users } from "../../../tests/fixtures/portal-database.mts";
import { createSupabasePortalRepository, requireMaker } from "./portal";

describe("正式migration・RLSとAds募集の接続", () => {
  let fixture: Awaited<ReturnType<typeof createPortalDatabase>>;
  beforeAll(async () => { fixture = await createPortalDatabase(); }, 30_000);
  afterAll(async () => { await fixture?.close(); });
  async function login(n = 101) {
    const client = createHeadlessBackend({ url: "https://fixture.supabase.co", publishableKey: "sb_publishable_fixture" }, fixture.fetcher);
    await signInBackend(client, users.find((u) => u.n === n)!.email, fixturePassword);
    return client;
  }
  it("2店舗の公開・終了募集を比較し、下書きと停止端末を除外する", async () => {
    const client = await login();
    expect(await requireMaker(client)).toEqual({ userId: id(101), makerIds: [id(11)] });
    const repo = createSupabasePortalRepository(client);
    expect((await repo.listStores()).map((s) => s.id)).toEqual([id(1), id(2)]);
    expect((await repo.listPublicAdCalls()).map((c) => c.id).sort()).toEqual([id(31), id(32), id(34)]);
    expect((await repo.listCategories()).sort()).toEqual(["パン", "食品"]);
    expect((await repo.listSignageDevices(id(1))).map((d) => d.location)).toEqual(["入口"]);
    expect(await repo.getAdCall({ role: "guest" }, id(33))).toBeUndefined();
    expect(await repo.getAdCall({ role: "guest" }, "C1")).toBeUndefined();
    expect((await repo.getAdCall({ role: "guest" }, id(31)))?.description).toBe("");
  });
  it("偽の画面セッションを渡しても本人の申請だけを返す", async () => {
    const repo = createSupabasePortalRepository(await login());
    expect(await repo.listMyApplications({ role: "maker_staff", makerId: id(12) }))
      .toEqual([{ id: id(61), ad_call_id: id(31) }]);
    const other = createSupabasePortalRepository(await login(102));
    expect(await other.listMyApplications({ role: "maker_staff", makerId: id(11) }))
      .toEqual([{ id: id(62), ad_call_id: id(31) }]);
  });
  it("役割があってもメーカー所属なしは拒否する", async () => {
    const client = await login(103);
    await expect(requireMaker(client)).rejects.toMatchObject({ code: "forbidden" });
    await expect(createSupabasePortalRepository(client).listStores()).rejects.toMatchObject({ code: "forbidden" });
  });
  it("店舗担当者・消費者のアカウントをメーカーとして扱わない", async () => {
    for (const n of [104, 105]) await expect(requireMaker(await login(n))).rejects.toMatchObject({ code: "forbidden" });
  });
  it("ログアウト後は募集を取り直せず、DBの要求も送らない", async () => {
    const client = await login();
    const repo = createSupabasePortalRepository(client);
    await repo.listPublicAdCalls();
    await signOutBackend(client);
    const before = fixture.requests.filter((s) => s.includes("/rest/")).length;
    await expect(repo.listPublicAdCalls()).rejects.toMatchObject({ code: "unauthenticated" });
    expect(fixture.requests.filter((s) => s.includes("/rest/")).length).toBe(before);
  });
  it("失効したセッションは仮データに戻さず拒否する", async () => {
    const client = await login(102);
    fixture.expired.add(id(102));
    // SDKがsession_not_foundで保存セッションを消去するため、再ログイン要求になる。
    try { await expect(createSupabasePortalRepository(client).listPublicAdCalls()).rejects.toMatchObject({ code: "unauthenticated" }); }
    finally { fixture.expired.delete(id(102)); }
  });
  it("SQLの正式RLSだけでも他メーカーの申請と下書きを読めない", async () => {
    const rows = await fixture.asUser(users[0], () => fixture.db.query("select id from ad_applications"));
    expect(rows.rows).toEqual([{ id: id(61) }]);
    const calls = await fixture.asUser(users[0], () => fixture.db.query("select id from ad_calls where status='draft'"));
    expect(calls.rows).toEqual([]);
    const changed = await fixture.asUser(users[0], () => fixture.db.query("update ad_calls set title='改変' returning id"));
    expect(changed.rows).toEqual([]);
  });
});
