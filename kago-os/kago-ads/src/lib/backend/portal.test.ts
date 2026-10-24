import { describe, expect, it } from "vitest";
import { BackendError } from "@kago/backend";
import { adsDataSource } from "./config";
import { mapAdCall, mapStore, portalError, type AdCallRow } from "./portal";
describe("Adsの接続境界", () => {
  it("設定なしは実接続、仮データは明示指定時だけ使う", () => {
    expect(adsDataSource("")).toBe("supabase");
    expect(adsDataSource("supabase")).toBe("supabase");
    expect(adsDataSource("mock")).toBe("mock");
    expect(() => adsDataSource("typo")).toThrow(BackendError);
  });
  it("DBにない店舗紹介・住所を仮データで補わず、NULLの支店名を表示用に変換する", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(mapStore({ id, slug: "demo", name: "架空店舗", branch_name: null, timezone: "Asia/Tokyo" }))
      .toEqual({ id, slug: "demo", name: "架空店舗", branch_name: "", timezone: "Asia/Tokyo", description: "", address: "" });
  });
  it("募集のUUID・期間の終了境界・公開範囲を変えずNULL案内文を変換する", () => {
    const row: AdCallRow = {
      id: "00000000-0000-4000-8000-000000000010",
      store_id: "00000000-0000-4000-8000-000000000001",
      title: "募集", description: null, categories: ["食品"], channels: ["signage"],
      starts_at: "2099-01-01T00:00:00+09:00", ends_at: "2099-02-01T00:00:00+09:00",
      status: "open", disclosure_scope: [], created_at: "2026-10-24T00:00:00Z", updated_at: "2026-10-24T00:00:00Z",
    };
    expect(mapAdCall(row)).toEqual({ ...row, description: "" });
  });
  it("DBの詳細・秘密情報をそのまま画面に返さない", () => {
    for (const code of ["42P01", "42501", "PGRST301", "unknown"]) {
      expect(portalError({ code, message: "secret-token SQL host" }).message).not.toContain("secret");
    }
    expect(portalError({ code: "42501" })).toMatchObject({ code: "forbidden" });
    expect(portalError({ code: "PGRST301" })).toMatchObject({ code: "session_expired" });
  });
});
