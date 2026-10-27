import "server-only";
import { fetchPromotions } from "./data-source";
import { USING_MOCK } from "./mode";
import { requireStoreSession } from "./store";
import {
  covers,
  defaultSalesDates,
  origins,
  parseCoverage,
  salesPeriods,
  salesSeries,
  type SalesOrigin,
  type SalesRow,
  type Period,
} from "./sales-trends";
export type SalesSearch = {
  promotion?: string;
  from?: string;
  to?: string;
  bucket?: string;
  origin?: string;
};
export type SalesViewModel = {
  promotions: Awaited<ReturnType<typeof fetchPromotions>>;
  selected: Awaited<ReturnType<typeof fetchPromotions>>[number] | null;
  from?: string;
  to?: string;
  bucket?: "day" | "hour";
  origin?: SalesOrigin;
  periods?: { current: Period; previous: Period };
  current?: ReturnType<typeof salesSeries>;
  previous?: ReturnType<typeof salesSeries>;
  canCompare?: boolean;
  mock?: boolean;
  message: string | null;
};
export async function loadPromotionSales(
  search: SalesSearch,
): Promise<SalesViewModel> {
  const promotions = await fetchPromotions({ includeInactive: true });
  const selected = search.promotion
    ? promotions.find((p) => p.promotion_version_id === search.promotion)
    : (promotions.find((p) => p.status === "active") ?? promotions[0]);
  if (!selected)
    return {
      promotions,
      selected: null,
      message: search.promotion
        ? "この店舗で確認できる販促を選んでください。"
        : "販売推移を確認できる販促がありません。",
    };
  const defaults = defaultSalesDates(selected.starts_at, selected.ends_at),
    from = search.from ?? defaults.from,
    to = search.to ?? defaults.to;
  const bucket =
      search.bucket === "hour" ? ("hour" as const) : ("day" as const),
    origin: SalesOrigin = origins.includes(search.origin as SalesOrigin)
      ? (search.origin as SalesOrigin)
      : USING_MOCK
        ? "synthetic"
        : "operated";
  let periods;
  try {
    periods = salesPeriods(from, to, {
      start: selected.starts_at,
      end: selected.ends_at,
    });
  } catch (error) {
    return {
      promotions,
      selected,
      from,
      to,
      bucket,
      origin,
      message: (error as Error).message,
    };
  }
  let currentRows: SalesRow[],
    previousRows: SalesRow[],
    currentKnown = false,
    previousKnown = false;
  if (USING_MOCK) {
    const make = (period: Period, multiplier: number) => {
      const unit = bucket === "day" ? 86400000 : 3600000,
        t =
          Math.floor((Date.parse(period.start) + 32400000) / unit) * unit -
          32400000;
      return [0, 1, 2]
        .filter((i) => t + i * unit < Date.parse(period.end))
        .map((i) => ({
          bucket_start: new Date(t + i * unit).toISOString(),
          data_origin: "synthetic",
          quantity: (i + 1) * multiplier,
          amount: (i + 1) * multiplier * 100,
        }));
    };
    currentRows = make(periods.current, 2);
    previousRows = make(periods.previous, 1);
    currentKnown = previousKnown = origin === "synthetic";
  } else {
    const { client, store } = await requireStoreSession();
    async function fetchRows(period: Period) {
      const all: SalesRow[] = [];
      for (let offset = 0; offset < 10000; offset += 1000) {
        const r = await client
          .rpc("kago_product_sales", {
            p_start: period.start,
            p_end: period.end,
            p_store_id: store.id,
            p_product_ids: [selected!.product_id],
            p_bucket: bucket,
          })
          .order("bucket_start")
          .order("data_origin")
          .range(offset, offset + 999);
        if (r.error)
          throw new Error(
            "販売推移を取得できません。接続・商品別販売API・自店への所属を確認してください。",
          );
        const rows = r.data as SalesRow[];
        all.push(...rows);
        if (rows.length < 1000) return all;
      }
      throw new Error("販売集計の件数が多すぎます。期間を短くしてください。");
    }
    try {
      [currentRows, previousRows] = await Promise.all([
        fetchRows(periods.current),
        fetchRows(periods.previous),
      ]);
    } catch {
      return {
        promotions,
        selected,
        from,
        to,
        bucket,
        origin,
        message:
          "販売推移を取得できません。通信・商品別販売API・自店への所属を確認してください。販売0件とは扱いません。",
      };
    }
    let coverage;
    try {
      coverage = parseCoverage(process.env.KAGO_SALES_RECORDING_COVERAGE);
    } catch {
      return {
        promotions,
        selected,
        from,
        to,
        bucket,
        origin,
        message:
          "販売記録範囲のサーバー設定を確認してください。比較結果は表示しません。",
      };
    }
    currentKnown = covers(
      coverage,
      store.id,
      selected.product_id,
      origin,
      periods.current,
    );
    previousKnown = covers(
      coverage,
      store.id,
      selected.product_id,
      origin,
      periods.previous,
    );
  }
  const current = salesSeries(
      currentRows,
      periods.current,
      bucket,
      origin,
      currentKnown,
    ),
    previous = salesSeries(
      previousRows,
      periods.previous,
      bucket,
      origin,
      previousKnown,
    );
  return {
    promotions,
    selected,
    from,
    to,
    bucket,
    origin,
    periods,
    current,
    previous,
    canCompare: currentKnown && previousKnown,
    mock: USING_MOCK,
    message: null,
  };
}
