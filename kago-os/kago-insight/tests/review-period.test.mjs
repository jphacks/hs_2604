import assert from "node:assert/strict";
import test from "node:test";
import { approvalPeriod, formatExclusiveEndDate, inclusiveEndInstant, toDateInputValue } from "../src/lib/format.ts";

const requested = { starts_at: "2026-10-25T15:00:00.000Z", ends_at: "2026-10-27T15:00:00.000Z" };

test("公開で見つかった希望期間は10/26〜10/27と表示する", () => {
  assert.equal(formatExclusiveEndDate(requested.ends_at), "2026/10/27");
  assert.equal(toDateInputValue(inclusiveEndInstant(requested.ends_at)), "2026-10-27");
});
test("未変更で承認すると、最終日を欠かさず元の範囲をそのまま渡す", () => {
  assert.deepEqual(approvalPeriod(requested, "2026-10-26", "2026-10-27"), requested);
});
test("1日だけへ短縮しても、その日の24時間を含む", () => {
  assert.deepEqual(approvalPeriod(requested, "2026-10-27", "2026-10-27"), {
    starts_at: "2026-10-26T15:00:00.000Z", ends_at: requested.ends_at,
  });
});
test("同日開始・終了の申請を空の期間にしない", () => {
  const oneDay = { starts_at: requested.starts_at, ends_at: "2026-10-26T15:00:00.000Z" };
  assert.deepEqual(approvalPeriod(oneDay, "2026-10-26", "2026-10-26"), oneDay);
});
test("年末・うるう日も日本時間の最終日として表示する", () => {
  assert.equal(formatExclusiveEndDate("2026-12-31T15:00:00.000Z"), "2026/12/31");
  assert.equal(formatExclusiveEndDate("2028-02-29T15:00:00.000Z"), "2028/2/29");
});
test("UTC境界の既存データを日本時間0時へ広げず保持する", () => {
  const timed = { starts_at: "2026-10-26T00:00:00.000Z", ends_at: "2026-10-27T00:00:00.000Z" };
  assert.deepEqual(approvalPeriod(timed, "2026-10-26", "2026-10-27"), timed);
  assert.deepEqual(approvalPeriod(timed, "2026-10-26", "2026-10-26"), {
    starts_at: timed.starts_at, ends_at: "2026-10-26T15:00:00.000Z",
  });
});
test("メーカーの希望を広げる日付・逆転・未入力・存在しない日を拒否する", () => {
  for (const [start, end] of [
    ["2026-10-25", "2026-10-27"], ["2026-10-26", "2026-10-28"],
    ["2026-10-27", "2026-10-26"], ["", "2026-10-27"],
    ["2026-02-30", "2026-10-27"], ["bad", "2026-10-27"],
  ]) assert.equal(approvalPeriod(requested, start, end), null);
});
