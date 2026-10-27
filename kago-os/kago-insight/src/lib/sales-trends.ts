export type SalesOrigin = "operated" | "seeded" | "synthetic";
export type Period = { start: string; end: string };
export type Coverage = {
  store_id: string;
  data_origin: SalesOrigin;
  start: string;
  end: string;
  product_ids?: string[];
};
export type SalesRow = {
  bucket_start: string;
  data_origin: string;
  quantity: number | string;
  amount: number | string;
};
export type SalesPoint = {
  at: string;
  quantity: number | null;
  amount: number | null;
};
const DAY = 86400000,
  OFFSET = 9 * 3600000;
export const origins: SalesOrigin[] = ["operated", "seeded", "synthetic"];
export function jstDate(ms: number) {
  return new Date(ms + OFFSET).toISOString().slice(0, 10);
}
function instant(value: string) {
  if (
    !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error("日時を確認してください。");
  return Date.parse(value);
}
function dateMs(value: string) {
  if (!/^\d{4}-\d\d-\d\d$/.test(value))
    throw new Error("日付を確認してください。");
  const ms = Date.parse(value + "T00:00:00+09:00");
  if (!Number.isFinite(ms) || jstDate(ms) !== value)
    throw new Error("存在する日付を入力してください。");
  return ms;
}
export function defaultSalesDates(
  start: string,
  end: string,
  now = Date.now(),
) {
  const last = Math.min(instant(end), now),
    first = instant(start);
  return {
    from: jstDate(Math.max(first, last - 6 * DAY)),
    to: jstDate(Math.max(first, last - 1)),
  };
}
export function salesPeriods(
  from: string,
  to: string,
  promotion: Period,
  now = Date.now(),
) {
  const start = Math.max(dateMs(from), instant(promotion.start)),
    end = Math.min(dateMs(to) + DAY, instant(promotion.end), now);
  if (end <= start)
    throw new Error(
      "販促の実施期間内で、開始日が終了日より前になる期間を選んでください。",
    );
  if (end - start > 31 * DAY)
    throw new Error("表示する期間は31日以内にしてください。");
  return {
    current: {
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
    },
    previous: {
      start: new Date(start - (end - start)).toISOString(),
      end: new Date(start).toISOString(),
    },
  };
}
export function parseCoverage(raw: string | undefined): Coverage[] {
  if (!raw) return [];
  let records: unknown;
  try {
    records = JSON.parse(raw);
  } catch {
    throw new Error("販売記録範囲のサーバー設定が正しくありません。");
  }
  if (!Array.isArray(records) || records.length > 100)
    throw new Error("販売記録範囲のサーバー設定が正しくありません。");
  return records.map((record) => {
    if (
      !record ||
      typeof record !== "object" ||
      typeof record.store_id !== "string" ||
      !origins.includes(record.data_origin) ||
      typeof record.start !== "string" ||
      typeof record.end !== "string" ||
      instant(record.start) >= instant(record.end) ||
      (record.product_ids !== undefined &&
        (!Array.isArray(record.product_ids) ||
          !record.product_ids.every((p: unknown) => typeof p === "string")))
    )
      throw new Error("販売記録範囲のサーバー設定が正しくありません。");
    return record as Coverage;
  });
}
export function covers(
  records: Coverage[],
  store: string,
  product: string,
  origin: SalesOrigin,
  period: Period,
) {
  return records.some(
    (c) =>
      c.store_id === store &&
      c.data_origin === origin &&
      (!c.product_ids || c.product_ids.includes(product)) &&
      instant(c.start) <= instant(period.start) &&
      instant(c.end) >= instant(period.end),
  );
}
function number(value: number | string) {
  if (typeof value === "string" && !/^\d+(?:\.0+)?$/.test(value))
    throw new Error("販売集計の数値を確認できません。");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("販売集計の数値を確認できません。");
  return n;
}
export function salesSeries(
  rows: SalesRow[],
  period: Period,
  bucket: "day" | "hour",
  origin: SalesOrigin,
  complete: boolean,
) {
  const unit = bucket === "day" ? DAY : 3600000,
    start = instant(period.start),
    end = instant(period.end),
    first = Math.floor((start + OFFSET) / unit) * unit - OFFSET;
  const byTime = new Map<number, { quantity: number; amount: number }>();
  for (const row of rows.filter((r) => r.data_origin === origin)) {
    const t = instant(row.bucket_start);
    if (t < first || t >= end || (t + OFFSET) % unit !== 0)
      throw new Error("販売集計の時間区切りを確認できません。");
    const previous = byTime.get(t) ?? { quantity: 0, amount: 0 };
    previous.quantity += number(row.quantity);
    previous.amount += number(row.amount);
    if (
      !Number.isSafeInteger(previous.quantity) ||
      !Number.isSafeInteger(previous.amount)
    )
      throw new Error("販売集計が大きすぎます。");
    byTime.set(t, previous);
  }
  const points: SalesPoint[] = [];
  for (let t = first; t < end; t += unit) {
    const row = byTime.get(t);
    points.push({
      at: new Date(t).toISOString(),
      quantity: row?.quantity ?? (complete ? 0 : null),
      amount: row?.amount ?? (complete ? 0 : null),
    });
  }
  const quantity = [...byTime.values()].reduce((s, r) => s + r.quantity, 0),
    amount = [...byTime.values()].reduce((s, r) => s + r.amount, 0);
  if (!Number.isSafeInteger(quantity) || !Number.isSafeInteger(amount))
    throw new Error("販売集計が大きすぎます。");
  return {
    points,
    hasObservations: byTime.size > 0,
    quantity,
    amount,
    complete,
  };
}
export function salesDifference(
  current: number,
  previous: number,
  allowed: boolean,
) {
  return allowed
    ? {
        difference: current - previous,
        percent:
          previous === 0 ? null : ((current - previous) / previous) * 100,
      }
    : null;
}
