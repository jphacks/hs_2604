import assert from "node:assert/strict";
import test from "node:test";
import {
  salesPeriods,
  salesSeries,
  salesDifference,
  covers,
  parseCoverage,
} from "../src/lib/sales-trends.ts";
const range = {
  start: "2026-10-25T15:00:00.000Z",
  end: "2026-10-26T15:00:00.000Z",
};
const promotion = {
  start: "2026-10-20T00:00:00+09:00",
  end: "2026-10-30T00:00:00+09:00",
};
const now = Date.parse("2026-10-28T00:00:00+09:00");
test("1日の販促と同じ24時間の直前期間を日本時間で計算する", () => {
  const r = salesPeriods("2026-10-26", "2026-10-26", promotion, now);
  assert.deepEqual(r.current, range);
  assert.equal(
    Date.parse(r.current.end) - Date.parse(r.current.start),
    Date.parse(r.previous.end) - Date.parse(r.previous.start),
  );
  assert.equal(r.previous.end, r.current.start);
});
test("販促の途中時刻で絞っても比較は同じ長さ", () => {
  const p = {
    start: "2026-10-26T10:30:00+09:00",
    end: "2026-10-27T11:15:00+09:00",
  };
  const r = salesPeriods("2026-10-26", "2026-10-27", p, now);
  assert.equal(r.current.start, new Date(p.start).toISOString());
  assert.equal(r.current.end, new Date(p.end).toISOString());
  assert.equal(
    Date.parse(r.current.end) - Date.parse(r.current.start),
    Date.parse(r.previous.end) - Date.parse(r.previous.start),
  );
});
test("存在しない日付・逆転・31日超を拒否", () => {
  for (const pair of [
    ["2026-02-30", "2026-03-01"],
    ["2026-10-28", "2026-10-25"],
    ["bad", "2026-10-26"],
  ])
    assert.throws(() => salesPeriods(...pair, promotion, now));
  assert.throws(() =>
    salesPeriods(
      "2026-01-01",
      "2026-03-01",
      { start: "2026-01-01T00:00:00Z", end: "2026-04-01T00:00:00Z" },
      now,
    ),
  );
});
test("空データと販売0を記録範囲の確認なしに同一視しない", () => {
  const unknown = salesSeries([], range, "day", "operated", false),
    known = salesSeries([], range, "day", "operated", true);
  assert.equal(unknown.points[0].quantity, null);
  assert.equal(unknown.hasObservations, false);
  assert.equal(known.points[0].quantity, 0);
});
test("無料の販売は金額0でも観測済み", () => {
  const s = salesSeries(
    [
      {
        bucket_start: range.start,
        data_origin: "operated",
        quantity: "2",
        amount: "0",
      },
    ],
    range,
    "day",
    "operated",
    false,
  );
  assert.ok(s.hasObservations);
  assert.equal(s.quantity, 2);
  assert.equal(s.points[0].amount, 0);
});
test("投入・合成を通常操作へ合算しない", () => {
  const s = salesSeries(
    [
      {
        bucket_start: range.start,
        data_origin: "operated",
        quantity: 1,
        amount: 228,
      },
      {
        bucket_start: range.start,
        data_origin: "seeded",
        quantity: 99,
        amount: 9999,
      },
    ],
    range,
    "day",
    "operated",
    false,
  );
  assert.equal(s.quantity, 1);
  assert.equal(s.amount, 228);
});
test("時間帯別はJST境界で欠落を切り分ける", () => {
  const p = {
    start: "2026-10-26T01:30:00+09:00",
    end: "2026-10-26T03:15:00+09:00",
  };
  const s = salesSeries(
    [
      {
        bucket_start: "2026-10-26T02:00:00+09:00",
        data_origin: "operated",
        quantity: 3,
        amount: 300,
      },
    ],
    p,
    "hour",
    "operated",
    false,
  );
  assert.equal(s.points.length, 3);
  assert.equal(s.points[0].quantity, null);
  assert.equal(s.points[1].quantity, 3);
  assert.equal(s.points[2].quantity, null);
});
test("負数・不明値・安全な整数を超える売上を拒否", () => {
  for (const v of [-1, "", "bad", Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() =>
      salesSeries(
        [
          {
            bucket_start: range.start,
            data_origin: "operated",
            quantity: v,
            amount: 1,
          },
        ],
        range,
        "day",
        "operated",
        false,
      ),
    );
});
test("確認範囲は店舗・商品・由来・全期間を満たす必要がある", () => {
  const c = parseCoverage(
    JSON.stringify([
      {
        store_id: "s1",
        data_origin: "operated",
        start: range.start,
        end: range.end,
        product_ids: ["p1"],
      },
    ]),
  );
  assert.ok(covers(c, "s1", "p1", "operated", range));
  assert.ok(!covers(c, "s2", "p1", "operated", range));
  assert.ok(!covers(c, "s1", "p2", "operated", range));
  assert.ok(!covers(c, "s1", "p1", "seeded", range));
  assert.ok(
    !covers(c, "s1", "p1", "operated", {
      ...range,
      start: "2026-10-24T15:00:00Z",
    }),
  );
});
test("比較不可、比較元0、通常の増減を区別する", () => {
  assert.equal(salesDifference(5, 3, false), null);
  assert.deepEqual(salesDifference(5, 0, true), {
    difference: 5,
    percent: null,
  });
  assert.deepEqual(salesDifference(6, 4, true), { difference: 2, percent: 50 });
  assert.deepEqual(salesDifference(0, 4, true), {
    difference: -4,
    percent: -100,
  });
});
test("記録範囲の不正な設定は黙って比較可能にしない", () => {
  assert.deepEqual(parseCoverage(undefined), []);
  for (const s of ["{", "{}", '[{"store_id":"s1"}]'])
    assert.throws(() => parseCoverage(s));
});

test("複数の区間を足した総額の桁あふれも拒否する", () => {
  const period = { start: range.start, end: "2026-10-27T15:00:00.000Z" };
  assert.throws(() =>
    salesSeries(
      [
        {
          bucket_start: range.start,
          data_origin: "operated",
          quantity: 1,
          amount: Number.MAX_SAFE_INTEGER,
        },
        {
          bucket_start: range.end,
          data_origin: "operated",
          quantity: 1,
          amount: 1,
        },
      ],
      period,
      "day",
      "operated",
      false,
    ),
  );
});
