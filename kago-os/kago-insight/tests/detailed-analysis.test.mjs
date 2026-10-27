import assert from "node:assert/strict";
import test from "node:test";
import {
  analysisPeriod,
  salesBreakdown,
} from "../src/lib/detailed-analysis.ts";
const now = Date.parse("2026-10-27T12:00:00+09:00");
test("日本時間の終了日を含み、現在時刻で絞る", () => {
  const p = analysisPeriod("2026-10-26", "2026-10-27", now);
  assert.equal(p.start, "2026-10-25T15:00:00.000Z");
  assert.equal(p.end, new Date(now).toISOString());
});
test("不正日付・逆転・未来・31日超を拒否", () => {
  for (const [a, b] of [
    ["2026-02-30", "2026-03-01"],
    ["2026-10-28", "2026-10-29"],
    ["2026-10-27", "2026-10-25"],
    ["2026-01-01", "2026-03-01"],
  ])
    assert.throws(() => analysisPeriod(a, b, now));
});
test("商品別は数量順、時間帯はJSTの同じ時刻を合算し、投入を混ぜない", () => {
  const r = salesBreakdown(
    [
      {
        product_id: "a",
        bucket_start: "2026-10-26T01:00:00Z",
        data_origin: "operated",
        quantity: 2,
        amount: 400,
      },
      {
        product_id: "a",
        bucket_start: "2026-10-25T01:00:00Z",
        data_origin: "operated",
        quantity: 1,
        amount: 200,
      },
      {
        product_id: "b",
        bucket_start: "2026-10-26T02:00:00Z",
        data_origin: "operated",
        quantity: 1,
        amount: 300,
      },
      {
        product_id: "b",
        bucket_start: "2026-10-26T02:00:00Z",
        data_origin: "seeded",
        quantity: 100,
        amount: 30000,
      },
    ],
    "operated",
  );
  assert.deepEqual(
    r.ranking.map((p) => [p.id, p.quantity, p.amount]),
    [
      ["a", 3, 600],
      ["b", 1, 300],
    ],
  );
  assert.equal(r.hours[10].quantity, 3);
  assert.equal(r.hours[11].quantity, 1);
  assert.equal(r.hours[9].quantity, null);
});
test("無料販売は金額0でも観測済み、空区間はnullのまま", () => {
  const r = salesBreakdown(
    [
      {
        product_id: "a",
        bucket_start: "2026-10-26T00:00:00Z",
        data_origin: "operated",
        quantity: "1",
        amount: "0",
      },
    ],
    "operated",
  );
  assert.equal(r.hours[9].amount, 0);
  assert.equal(r.hours[8].amount, null);
});
test("不明値・負数・桁あふれを0として表示しない", () => {
  for (const quantity of ["", " ", -1, "bad", Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() =>
      salesBreakdown(
        [
          {
            product_id: "a",
            bucket_start: "2026-10-26T00:00:00Z",
            data_origin: "operated",
            quantity,
            amount: 1,
          },
        ],
        "operated",
      ),
    );
});
