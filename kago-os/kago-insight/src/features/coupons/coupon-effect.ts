import { rate } from "@/lib/format";

/**
 * DEMO-09 販促効果の集計と、次の打ち手の選び方。
 * 画面から切り離し、手計算と照合しやすい純粋な関数にしておく。
 */

type Counts = { distributed: number; claimed: number; purchased: number };

export type CouponOffer = {
  offer_id: string;
  product_name: string;
  trigger_product_name: string;
  discount_percent: number;
  list_price: number;
  unit_discount: number;
  daily: { distributed: number[]; claimed: number[]; purchased: number[] };
  previous: Counts;
};

export type Totals = Counts & {
  salesTotal: number;
  discountTotal: number;
  claimRate: number | null;
  /** 購入率 = 購入 ÷ 配布 */
  purchaseRate: number | null;
  /** 受け取り後の購入率 = 購入 ÷ 受け取り。受け取り0件なら null（「—」） */
  purchaseAfterClaimRate: number | null;
  /** 値引きが0円なら「1円あたり」は定義できないため null（0ではない） */
  salesPerYen: number | null;
};

const sum = (values: number[]) => values.reduce((acc, v) => acc + v, 0);

/** 値引き単価は DB の kago_offer_unit_discount と同じ floor(price * percent / 100) */
function toTotals(offer: Pick<CouponOffer, "list_price" | "unit_discount">, counts: Counts): Totals {
  const salesTotal = counts.purchased * (offer.list_price - offer.unit_discount);
  const discountTotal = counts.purchased * offer.unit_discount;
  return withRates({ ...counts, salesTotal, discountTotal });
}

function withRates(t: Counts & { salesTotal: number; discountTotal: number }): Totals {
  return {
    ...t,
    claimRate: rate(t.claimed, t.distributed),
    purchaseRate: rate(t.purchased, t.distributed),
    purchaseAfterClaimRate: rate(t.purchased, t.claimed),
    salesPerYen: t.discountTotal === 0 ? null : t.salesTotal / t.discountTotal,
  };
}

function addUp(rows: Totals[]): Totals {
  const pick = (key: keyof Counts | "salesTotal" | "discountTotal") => sum(rows.map((r) => r[key]));
  return withRates({
    distributed: pick("distributed"),
    claimed: pick("claimed"),
    purchased: pick("purchased"),
    salesTotal: pick("salesTotal"),
    discountTotal: pick("discountTotal"),
  });
}

function dayCounts(offer: CouponOffer, day: number): Counts {
  return {
    distributed: offer.daily.distributed[day],
    claimed: offer.daily.claimed[day],
    purchased: offer.daily.purchased[day],
  };
}

export type OfferSummary = {
  offer: CouponOffer;
  current: Totals;
  verdict: Verdict;
};

export type Verdict = "keep" | "expand" | "review";

export type Dashboard = {
  current: Totals;
  previous: Totals;
  /** 日別の合計。グラフとKPIの小さな棒に使う */
  daily: Totals[];
  offers: OfferSummary[];
};

/**
 * 判断の固定ルール（比較対象を置いていないため、あくまで「候補」）
 *   受け取り0件                         → 見直し候補
 *   購入率が全体以上で、値引き1円あたりの売上が最大 → 拡大候補
 *   購入率が全体以上                     → 継続候補
 *   それ以外                            → 見直し候補
 */
export function buildDashboard(offers: CouponOffer[], dayCount: number): Dashboard {
  const rows = offers.map((offer) => {
    const counts = {
      distributed: sum(offer.daily.distributed),
      claimed: sum(offer.daily.claimed),
      purchased: sum(offer.daily.purchased),
    };
    return { offer, current: toTotals(offer, counts) };
  });
  const current = addUp(rows.map((r) => r.current));
  const previous = addUp(offers.map((o) => toTotals(o, o.previous)));
  const daily = Array.from({ length: dayCount }, (_, day) =>
    addUp(offers.map((o) => toTotals(o, dayCounts(o, day)))),
  );

  const bestPerYen = Math.max(...rows.map((r) => r.current.salesPerYen ?? -1));
  const summaries = rows.map(({ offer, current: c }): OfferSummary => {
    let verdict: Verdict = "review";
    if (c.claimed > 0 && c.purchaseRate !== null && current.purchaseRate !== null) {
      if (c.purchaseRate >= current.purchaseRate) {
        verdict = c.salesPerYen === bestPerYen ? "expand" : "keep";
      }
    }
    return { offer, current: c, verdict };
  });

  return { current, previous, daily, offers: summaries };
}

/** 前週比。前週が0なら比べられないため null */
export function changeRatio(current: number, previous: number): number | null {
  return previous === 0 ? null : current / previous - 1;
}

/** 率どうしの差（ポイント）。どちらかが「対象なし」なら null */
export function changePoints(current: number | null, previous: number | null): number | null {
  return current === null || previous === null ? null : (current - previous) * 100;
}

export function formatPerYen(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}円`;
}

export function formatSigned(value: number | null, unit: "%" | "pt"): string {
  if (value === null) return "—";
  const n = unit === "%" ? value * 100 : value;
  const rounded = Math.round(n * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}${unit}`;
}
