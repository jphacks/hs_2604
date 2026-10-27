import "server-only";
import { USING_MOCK } from "./mode";
import { requireStoreSession } from "./store";
import {
  analysisPeriod,
  salesBreakdown,
  type SalesRow,
  type DetailedMetrics,
  type AnalysisPeriod,
} from "./detailed-analysis";
export const originLabels = {
  operated: "通常操作（疑似購入を含む）",
  seeded: "事前投入",
  synthetic: "合成データ",
};
type AnalysisView = {
  error: string | null;
  origin: keyof typeof originLabels;
  period?: AnalysisPeriod;
  metrics?: DetailedMetrics;
  names?: Record<string, string>;
  mock?: boolean;
  ranking?: ReturnType<typeof salesBreakdown>["ranking"];
  hours?: ReturnType<typeof salesBreakdown>["hours"];
};
export async function loadDetailedAnalysis(search: {
  from?: string;
  to?: string;
  origin?: string;
}): Promise<AnalysisView> {
  const session = USING_MOCK ? null : await requireStoreSession();
  const origin =
    search.origin && Object.hasOwn(originLabels, search.origin)
      ? (search.origin as keyof typeof originLabels)
      : USING_MOCK
        ? "synthetic"
        : "operated";
  let period: AnalysisPeriod;
  try {
    period = analysisPeriod(search.from, search.to);
  } catch (e) {
    return { error: (e as Error).message, origin };
  }
  try {
    let rows: SalesRow[] = [],
      metrics: DetailedMetrics,
      names: Record<string, string> = {};
    if (USING_MOCK) {
      metrics = {
        methods: [
          {
            placement_type: "sponsored",
            reason_code: "sponsored_related",
            shown: 2,
            added: 1,
            dismissed: 1,
          },
        ],
        removal_statuses: [
          { status: "submitted", count: 1 },
          { status: "skipped", count: 1 },
          { status: "unanswered", count: 1 },
          { status: "uncollected", count: 1 },
        ],
        removal_reasons: [{ reason: "価格が合わない", count: 1 }],
        compared: 1,
        unshown_adds: 1,
        unshown_dismissals: 0,
        removals: 4,
      };
      rows = [
        {
          product_id: "p1",
          bucket_start: period.start,
          data_origin: "synthetic",
          quantity: 2,
          amount: 400,
        },
        {
          product_id: "p2",
          bucket_start: new Date(
            Date.parse(period.start) + 3600000,
          ).toISOString(),
          data_origin: "synthetic",
          quantity: 1,
          amount: 300,
        },
      ];
      names = { p1: "固定例のトマト", p2: "固定例のパン" };
      if (origin !== "synthetic") {
        rows = [];
        metrics = {
          methods: [],
          removal_statuses: [],
          removal_reasons: [],
          compared: 0,
          unshown_adds: 0,
          unshown_dismissals: 0,
          removals: 0,
        };
      }
    } else {
      const { client, store } = session!;
      const result = await client.rpc("kago_detailed_insight", {
        p_start: period.start,
        p_end: period.end,
        p_store_id: store.id,
        p_origin: origin,
      });
      if (result.error) throw result.error;
      metrics = result.data as DetailedMetrics;
      for (let offset = 0; offset < 10000; offset += 1000) {
        const result = await client
          .rpc("kago_product_sales", {
            p_start: period.start,
            p_end: period.end,
            p_store_id: store.id,
            p_bucket: "hour",
          })
          .order("bucket_start")
          .order("product_id")
          .order("data_origin")
          .range(offset, offset + 999);
        if (result.error) throw result.error;
        rows.push(...(result.data as SalesRow[]));
        if (result.data.length < 1000) break;
        if (offset === 9000) throw Error("sales-limit");
      }
      const ids = [
        ...new Set(
          rows.filter((r) => r.data_origin === origin).map((r) => r.product_id),
        ),
      ];
      for (let i = 0; i < ids.length; i += 100) {
        const result = await client
          .from("products")
          .select("id,name")
          .in("id", ids.slice(i, i + 100));
        if (result.error) throw result.error;
        for (const p of result.data ?? []) names[p.id] = p.name;
      }
    }
    return {
      error: null,
      origin,
      period,
      metrics,
      names,
      ...salesBreakdown(rows, origin),
      mock: USING_MOCK,
    };
  } catch {
    return {
      error:
        "詳細集計を取得できません。通信・自店への所属・集計APIの適用状況を確認してください。販売0件や拒否なしとは扱いません。",
      origin,
      period,
    };
  }
}
