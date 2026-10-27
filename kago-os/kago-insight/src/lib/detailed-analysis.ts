export type SalesRow = {
  product_id: string;
  bucket_start: string;
  data_origin: string;
  quantity: number | string;
  amount: number | string;
};
export type AnalysisPeriod = {
  start: string;
  end: string;
  from: string;
  to: string;
};
const DAY = 86400000,
  OFFSET = 32400000;
const day = (t: number) => new Date(t + OFFSET).toISOString().slice(0, 10);
export function analysisPeriod(
  from?: string,
  to?: string,
  now = Date.now(),
): AnalysisPeriod {
  const a = from ?? day(now - 6 * DAY),
    b = to ?? day(now);
  const parse = (v: string) => {
    if (!/^\d{4}-\d\d-\d\d$/.test(v)) throw Error("日付を確認してください。");
    const t = Date.parse(v + "T00:00:00+09:00");
    if (!Number.isFinite(t) || day(t) !== v)
      throw Error("存在する日付を入力してください。");
    return t;
  };
  const start = parse(a),
    end = Math.min(parse(b) + DAY, now);
  if (end <= start || end - start > 31 * DAY)
    throw Error("過去から現在までの31日以内の期間を選んでください。");
  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    from: a,
    to: b,
  };
}
export function salesBreakdown(rows: SalesRow[], origin: string) {
  const products = new Map<
      string,
      { id: string; quantity: number; amount: number }
    >(),
    hours = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      quantity: null as number | null,
      amount: null as number | null,
    }));
  const number = (value: number | string) => {
    const n = Number(value);
    if (
      (typeof value !== "number" && typeof value !== "string") ||
      (typeof value === "string" && !/^\d+(?:\.0+)?$/.test(value)) ||
      !Number.isSafeInteger(n) ||
      n < 0
    )
      throw Error("販売集計の数値を確認できません。");
    return n;
  };
  for (const row of rows.filter((r) => r.data_origin === origin)) {
    const t = Date.parse(row.bucket_start);
    if (!Number.isFinite(t)) throw Error("販売集計の時刻を確認できません。");
    const quantity = number(row.quantity),
      amount = number(row.amount),
      p = products.get(row.product_id) ?? {
        id: row.product_id,
        quantity: 0,
        amount: 0,
      };
    p.quantity += quantity;
    p.amount += amount;
    products.set(row.product_id, p);
    const h = hours[new Date(t + OFFSET).getUTCHours()];
    h.quantity = (h.quantity ?? 0) + quantity;
    h.amount = (h.amount ?? 0) + amount;
    if (
      ![p.quantity, p.amount, h.quantity, h.amount].every(Number.isSafeInteger)
    )
      throw Error("販売集計が大きすぎます。");
  }
  return {
    ranking: [...products.values()].sort(
      (a, b) =>
        b.quantity - a.quantity ||
        b.amount - a.amount ||
        a.id.localeCompare(b.id),
    ),
    hours,
  };
}
export type DetailedMetrics = {
  methods: {
    placement_type: string;
    reason_code: string;
    shown: number;
    added: number;
    dismissed: number;
  }[];
  removal_statuses: { status: string; count: number }[];
  removal_reasons: { reason: string; count: number }[];
  compared: number;
  unshown_adds: number;
  unshown_dismissals: number;
  removals: number;
};
