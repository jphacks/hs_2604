import { describe, expect, it } from "vitest";
import type { PortalClient } from "./portal";
import { createSupabaseResultsRepository } from "./results";

type Row = Record<string, unknown>;

/** 読むだけの偽の Supabase クライアント（eq・in で絞り、呼ばれた RPC を記録する） */
function fakeClient(tables: Record<string, Row[]>, rpcs: Record<string, Row[]>, roles = ["maker_staff"]) {
  const rpcCalls: [string, unknown][] = [];
  const from = (table: string) => {
    const filters: [string, string, unknown][] = [];
    const q = {
      select: () => q,
      order: () => q,
      eq: (c: string, v: unknown) => (filters.push(["eq", c, v]), q),
      in: (c: string, v: unknown[]) => (filters.push(["in", c, v]), q),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        let rows = tables[table] ?? [];
        for (const [op, c, v] of filters) rows = rows.filter((r) => (op === "eq" ? r[c] === v : (v as unknown[]).includes(r[c])));
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return q;
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "user-1", app_metadata: { kago: { roles } } } }, error: null }) },
    from,
    rpc: (name: string, params: unknown) => (rpcCalls.push([name, params]), Promise.resolve({ data: rpcs[name] ?? [], error: null })),
  } as unknown as PortalClient;
  return { client, rpcCalls };
}

const tables: Record<string, Row[]> = {
  maker_members: [{ maker_id: "M1", user_id: "user-1" }],
  ad_applications: [{ id: "A1", ad_call_id: "C1", maker_id: "M1" }, { id: "A9", ad_call_id: "C1", maker_id: "M9" }],
  ad_placements: [
    { id: "PL1", application_id: "A1", store_id: "S1", creative_version_id: "V2", channels: ["app", "signage"], starts_at: "2026-10-23T00:00:00+09:00", ends_at: "2026-12-01T00:00:00+09:00", status: "active" },
    { id: "PL9", application_id: "A9", store_id: "S1", creative_version_id: "V9", channels: ["app"], starts_at: "", ends_at: "", status: "active" },
  ],
  creative_versions: [{ id: "V2", creative_id: "CR1", version: 2, headline: "ゆでたパスタに、かけるだけ。" }],
  creatives: [{ id: "CR1", product_id: "P1" }],
  products: [{ id: "P1", name: "トマトパスタソース" }],
  ad_calls: [{ id: "C1", title: "パスタ関連商品の広告募集", disclosure_scope: ["impressions", "purchases"] }],
  stores: [{ id: "S1", name: "広島デモ店", branch_name: null }],
};
const appRow = (over: Row) => ({ store_id: "S1", data_origin: "operated", placement_type: "sponsored", ad_placement_id: "PL1", impressions: 2, shown_visits: 2, clicks: null, purchases: 1, ...over });
const query = { start: "2026-10-01T00:00:00+09:00", end: "2026-11-01T00:00:00+09:00" };

describe("ADS-04 DB 版の窓口", () => {
  it("自社の配信対象と、DB-09 の期間指定つき関数の集計を返す（他社・販促の行は混ぜない）", async () => {
    const { client, rpcCalls } = fakeClient(tables, {
      kago_app_metrics: [appRow({}), appRow({ ad_placement_id: "PL9" }), appRow({ placement_type: "store_promo", ad_placement_id: null })],
      kago_signage_metrics: [{ ad_placement_id: "PL1", plays: 20 }, { ad_placement_id: null, plays: 5 }],
    });
    const r = await createSupabaseResultsRepository(client).listMakerResults({ role: "maker_staff", makerId: "M1" }, query);
    expect(r.placements).toEqual([{
      id: "PL1", store_id: "S1", store_name: "広島デモ店", call_title: "パスタ関連商品の広告募集", product_name: "トマトパスタソース",
      headline: "ゆでたパスタに、かけるだけ。", version: 2, channels: ["app", "signage"],
      starts_at: "2026-10-23T00:00:00+09:00", ends_at: "2026-12-01T00:00:00+09:00", status: "active", disclosure_scope: ["impressions", "purchases"],
    }]);
    expect(r.app.map((a) => a.ad_placement_id)).toEqual(["PL1"]);
    expect(r.signage.map((s) => s.plays)).toEqual([20]);
    const params = { p_start: query.start, p_end: query.end, p_store_id: null };
    expect(rpcCalls).toEqual([["kago_app_metrics", params], ["kago_signage_metrics", params]]);
  });

  it("申請がなければ集計を呼ばずに空を返す", async () => {
    const { client, rpcCalls } = fakeClient({ ...tables, ad_applications: [] }, {});
    expect(await createSupabaseResultsRepository(client).listMakerResults({ role: "maker_staff", makerId: "M1" }, query))
      .toEqual({ placements: [], app: [], signage: [] });
    expect(rpcCalls).toEqual([]);
  });

  it("メーカーの所属がない・店舗の担当者は使えない（画面のセッションは信用しない）", async () => {
    const noMember = fakeClient({ ...tables, maker_members: [] }, {});
    await expect(createSupabaseResultsRepository(noMember.client).listMakerResults({ role: "maker_staff", makerId: "M1" }, query))
      .rejects.toMatchObject({ code: "forbidden" });
    const store = fakeClient(tables, {}, ["store_staff"]);
    await expect(createSupabaseResultsRepository(store.client).listMakerResults({ role: "maker_staff", makerId: "M1" }, query))
      .rejects.toMatchObject({ code: "forbidden" });
  });
});
