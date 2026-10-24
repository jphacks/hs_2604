import { describe, expect, it } from "vitest";
import { adCallWrite, storeCallError } from "./store-calls";
import type { AdCallInput } from "../data/repository";
const valid: AdCallInput = {
  title: " 募集 ", categories: ["食品"], channels: ["app"], starts_at: "2099-01-01T00:00:00+09:00",
  ends_at: "2099-02-01T00:00:00+09:00", description: " 案内 ", disclosure_scope: [],
};
describe("募集保存の入力境界", () => {
  it("入力に余分な店舗・状態があっても保存項目へ渡さない", () => {
    expect(adCallWrite({ ...valid, store_id: "other", status: "open" } as AdCallInput))
      .toEqual({ ...valid, title: "募集", description: "案内" });
  });
  it("公開範囲0項目を許可し、不正な期間・重複媒体・長すぎる案内文を拒否する", () => {
    expect(adCallWrite(valid).disclosure_scope).toEqual([]);
    for (const change of [{ ends_at: "invalid" }, { channels: ["app", "app"] }, { description: "a".repeat(2001) }]) {
      expect(() => adCallWrite({ ...valid, ...change } as AdCallInput)).toThrow();
    }
  });
  it("DBの失敗の詳細を画面へ漏らさない", () => {
    for (const code of ["23514", "23505", "42501"]) expect(storeCallError({ code, message: "secret SQL" }).message).not.toContain("secret");
  });
});
