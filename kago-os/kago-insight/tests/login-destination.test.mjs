import assert from "node:assert/strict";
import test from "node:test";
import { loginDestination } from "../src/lib/login-destination.ts";

test("通常画面だけを戻り先として受け付ける", () => {
  for (const screen of ["/review", "/promotions", "/metrics", "/coupons", "/signage-decisions", "/sales"])
    assert.equal(loginDestination(screen), screen);
});
test("公開用basePathを二重に付けず、単独起動と同じ戻り先にする", () => {
  assert.equal(loginDestination("/insight/review"), "/review");
  assert.equal(loginDestination("/insight/metrics?from=2026-10-01"), "/metrics?from=2026-10-01");
});
test("表示条件とアンカーを保持する", () => {
  assert.equal(loginDestination("/coupons?from=2026-10-01&to=2026-10-26#sales"), "/coupons?from=2026-10-01&to=2026-10-26#sales");
});
test("外部サイト・プロトコル相対・バックスラッシュへの誘導は拒否する", () => {
  for (const value of ["https://evil.invalid", "//evil.invalid/review", "/\\evil.invalid", "/review\\evil", "javascript:alert(1)", "/%2f%2fevil.invalid"])
    assert.equal(loginDestination(value), "/promotions");
});
test("認証画面・API・他サービス・存在しないパスは拒否する", () => {
  for (const value of ["/login", "/api/demo-signin", "/App", "/ads", "/review/../login", "/insight/login", "/unknown"])
    assert.equal(loginDestination(value), "/promotions");
});
test("制御文字・非文字列・複数パラメータ・過大入力は通常の入口へ戻す", () => {
  for (const value of [undefined, null, ["/review", "//evil.invalid"], {}, "/review\r\nLocation:evil", " /review", "/review?x=" + "a".repeat(2048)])
    assert.equal(loginDestination(value), "/promotions");
});
