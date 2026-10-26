import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHeadlessBackend, getAdImageUrl, signInBackend, signOutBackend } from "@kago/backend";
import { createSignageDatabase, fixturePassword, id, imagePath, user } from "../../../tests/fixtures/signage-database.mts";
import { NeedLoginError, supabaseSignageSource } from "../../features/signage/source";
import { endPlay, startPlay } from "../signage/plays";
import { insertSignagePlays, loadSignageFeed, requireDevice, signInDevice, type SignageClient } from "./signage";

// 2026-10-25（日）。16〜19時の販促が出る時刻と出ない時刻で確かめる
const at = (hm: string) => new Date(`2026-10-25T${hm}:00+09:00`);

describe("Signage 端末と正式の migration・RLS（SIG-01〜03）", () => {
  let fixture: Awaited<ReturnType<typeof createSignageDatabase>>;
  beforeAll(async () => {
    fixture = await createSignageDatabase();
  }, 60_000);
  afterAll(async () => {
    await fixture?.close();
  });

  const client = () => createHeadlessBackend({ url: "https://fixture.supabase.co", publishableKey: "sb_publishable_fixture" }, fixture.fetcher) as SignageClient;
  async function device(email = "device-one@example.test") {
    const c = client();
    const session = await signInDevice(c, email, fixturePassword);
    return { c, session };
  }
  const plays = async () => (await fixture.db.query<{ id: string; end_reason: string }>("select id,end_reason from signage_plays order by id")).rows;

  it("端末の ID・店舗は Auth が検証した app_metadata から決まる", async () => {
    const { c, session } = await device();
    expect(session).toEqual({ role: "signage", deviceId: id(41), storeId: id(1) });
    expect(await requireDevice(c)).toEqual(session);
  });

  it("17時：自店の配信中の広告と、期間・時間帯内の販促（優先度順）を交互に並べる", async () => {
    const { c, session } = await device();
    const feed = await loadSignageFeed(c, session, at("17:00"));
    expect(feed.device).toMatchObject({ id: id(41), location: "入口" });
    expect(feed.store_name).toBe("架空1号店");
    expect(feed.items.map((i) => i.key)).toEqual([id(71), id(85), id(84)]);
    const [ad, evening, bread] = feed.items;
    expect(ad).toMatchObject({
      placement_type: "sponsored", ad_placement_id: id(71), creative_version_id: id(53), group_key: `application:${id(61)}`,
      maker_name: "架空トマト食品", product_name: "架空のパスタソース", price: 298, reason_code: "approved_order",
    });
    expect(ad.asset).toMatchObject({ kind: "image", path: imagePath(11, 51, 91) });
    expect(evening).toMatchObject({ promotion_version_id: id(85), group_key: `promotion:${id(82)}`, price: 238, reason_text: "夕方の特売です" });
    expect(evening.valid_until).toBe(at("19:00").toISOString());
    expect(bread).toMatchObject({ promotion_version_id: id(84), product_name: "架空の塩パン", price: 130 });
  });

  it("App だけの広告・停止した広告・停止した販促の版・他店の広告・時間帯外の販促は端末に届かない", async () => {
    const { c, session } = await device();
    const keys = (await loadSignageFeed(c, session, at("10:00"))).items.map((i) => i.key);
    expect(keys).toEqual([id(71), id(84)]);
    for (const hidden of [id(72), id(74), id(73), id(83), id(85)]) expect(keys).not.toContain(hidden);
    // 端末には停止中の配信対象の行そのものが見えない（停止はすぐ切り替える判定を group_key で行う）
    const rows = await fixture.asUser(user("device-one@example.test"), async () =>
      (await fixture.db.query<{ id: string }>("select id from ad_placements order by id")).rows.map((r) => r.id));
    expect(rows).toEqual([id(71), id(72)]);
  });

  it("2店舗目の端末は自店の広告だけを読み、店舗別価格で表示する", async () => {
    const { c, session } = await device("device-two@example.test");
    const feed = await loadSignageFeed(c, session, at("17:00"));
    expect(feed.items.map((i) => [i.key, i.price])).toEqual([[id(73), 278]]);
  });

  it("撤去した端末・端末以外のアカウントは端末として使えない", async () => {
    const off = client();
    await signInBackend(off, "device-off@example.test", fixturePassword, "signage");
    const session = await requireDevice(off);
    await expect(loadSignageFeed(off, session, at("17:00"))).rejects.toMatchObject({ code: "forbidden" });
    for (const email of ["maker@example.test", "store@example.test", "customer@example.test"]) {
      await expect(signInDevice(client(), email, fixturePassword)).rejects.toMatchObject({ code: "forbidden" });
    }
  });

  it("停止端末の権限拒否は通信失敗と区別し、再ログインを要求する",async()=>{
    const c=client();await signInBackend(c,"device-off@example.test",fixturePassword,"signage");
    await expect(supabaseSignageSource(c).getFeed({role:"signage",deviceId:id(42),storeId:id(1)})).rejects.toBeInstanceOf(NeedLoginError);
  });

  it("画面の値で別の端末・店舗を名乗っても、その店舗の内容は読めない", async () => {
    const { c } = await device();
    await expect(loadSignageFeed(c, { role: "signage", deviceId: id(43), storeId: id(2) }, at("17:00"))).rejects.toMatchObject({ code: "forbidden" });
  });

  it("再生記録：終わった記録を保存し、同じ記録の再送は1件のまま。合わない記録だけを受け付けない", async () => {
    const { c, session } = await device();
    const feed = await loadSignageFeed(c, session, at("17:00"));
    const begin = at("17:00").toISOString();
    const end = at("17:00").getTime() + 10_000;
    const ok = endPlay(startPlay(id(41), feed.items[0], "no_content", begin, id(901)), new Date(end).toISOString(), "completed");
    const promo = endPlay(startPlay(id(41), feed.items[1], "no_content", begin, id(902)), new Date(end).toISOString(), "updated");
    const fallback = endPlay(startPlay(id(41), null, "cache_expired", begin, id(903)), new Date(end).toISOString(), "updated");
    expect(await insertSignagePlays(c, session, [ok, promo, fallback])).toEqual({ rejected: [] });
    expect(await insertSignagePlays(c, session, [ok])).toEqual({ rejected: [] });
    expect((await plays()).map((p) => p.id)).toEqual([id(901), id(902), id(903)]);

    // 同じ id で中身が違う記録・配信期間の外の記録は通らない。まとめて送った正しい記録は保存される
    const changed = { ...ok, end_reason: "suspended" as const };
    const outside = { ...endPlay(startPlay(id(41), feed.items[0], "no_content", "2100-01-01T00:00:00Z", id(904)), "2100-01-01T00:00:10Z", "completed") };
    const good = endPlay(startPlay(id(41), feed.items[2], "no_content", begin, id(905)), new Date(end).toISOString(), "completed");
    expect(await insertSignagePlays(c, session, [changed, outside, good])).toEqual({ rejected: [id(901), id(904)] });
    expect(await plays()).toEqual([
      { id: id(901), end_reason: "completed" }, { id: id(902), end_reason: "updated" },
      { id: id(903), end_reason: "updated" }, { id: id(905), end_reason: "completed" },
    ]);
  });

  it("他の端末の記録・再生中の記録は送らない", async () => {
    const { c, session } = await device();
    const feed = await loadSignageFeed(c, session, at("17:00"));
    const other = endPlay(startPlay(id(43), feed.items[0], "no_content", at("17:00").toISOString()), at("17:01").toISOString(), "completed");
    await expect(insertSignagePlays(c, session, [other])).rejects.toMatchObject({ code: "forbidden" });
    await expect(insertSignagePlays(c, session, [startPlay(id(41), feed.items[0], "no_content", at("17:00").toISOString())])).rejects.toMatchObject({ code: "forbidden" });
  });

  it("素材の画像は、自店で配信中の広告のものだけ署名付き URL を作れる", async () => {
    const { c } = await device();
    expect((await getAdImageUrl(c, imagePath(11, 51, 91))).url).toContain("token=fixture");
    await expect(getAdImageUrl(c, imagePath(11, 57, 94))).rejects.toMatchObject({ code: "read_failed" });
    await expect(getAdImageUrl(c, imagePath(11, 56, 93))).rejects.toMatchObject({ code: "read_failed" });
  });

  it("ログアウトした端末は、窓口がログイン画面を求める（仮データに戻さない）", async () => {
    const { c } = await device();
    const source = supabaseSignageSource(c);
    const session = await source.signIn();
    await signOutBackend(c);
    await expect(source.signIn()).rejects.toBeInstanceOf(NeedLoginError);
    await expect(source.getFeed(session)).rejects.toBeInstanceOf(Error);
  });
});
