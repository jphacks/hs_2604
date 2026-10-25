import { insightPath } from "@/lib/paths";
import {
  fetchAppMetrics,
  fetchOrderTotals,
  fetchPlacements,
  fetchPromotions,
  fetchSelectionCounts,
  fetchSignageMetrics,
} from "@/lib/data-source";
import { MetricsScreen } from "@/features/metrics/metrics-screen";

export default async function Page() {
  const [appRows, signageRows, selectionCounts, orderTotals, placements, promotions] =
    await Promise.all([
      fetchAppMetrics(),
      fetchSignageMetrics(),
      fetchSelectionCounts(),
      fetchOrderTotals(),
      fetchPlacements(),
      fetchPromotions(),
    ]);

  // DB-09 は ID しか返さないので、表示名は画面側で解決する。
  const subjectNames: Record<string, string> = {};
  for (const p of placements) {
    subjectNames[p.id] = `${p.product_name}（${p.maker_display_name}）`;
  }
  for (const p of promotions) {
    subjectNames[p.promotion_version_id] = p.product_name;
  }

  return (
    <><p className="mb-4 text-sm"><a className="underline" href={insightPath("/fixed-results/index.html")}>通信断に備えて説明用の固定成果を開く</a></p><MetricsScreen
      appRows={appRows}
      signageRows={signageRows}
      selectionCounts={selectionCounts}
      orderTotals={orderTotals}
      subjectNames={subjectNames}
    /></>
  );
}
