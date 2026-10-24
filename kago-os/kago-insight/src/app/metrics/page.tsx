import {
  fetchAppMetrics,
  fetchPlacements,
  fetchPromotions,
  fetchSignageMetrics,
} from "@/lib/data-source";
import { MetricsScreen } from "@/features/metrics/metrics-screen";

export default async function Page() {
  const [appRows, signageRows, placements, promotions] = await Promise.all([
    fetchAppMetrics(),
    fetchSignageMetrics(),
    fetchPlacements(),
    fetchPromotions(),
  ]);

  // DB-09 のビューは ID しか返さない想定なので、表示名は画面側で解決する。
  const subjectNames: Record<string, string> = {};
  for (const p of placements) {
    subjectNames[p.id] = `${p.product_name}（${p.maker_display_name}）`;
  }
  for (const p of promotions) {
    subjectNames[p.promotion_version_id] = p.product_name;
  }

  return (
    <MetricsScreen
      appRows={appRows}
      signageRows={signageRows}
      subjectNames={subjectNames}
    />
  );
}
