// ADS-04 の DB 版。メーカー本人のセッションと正式の RLS・DB-09 の集計関数で、自社広告の公開された集計だけを読む
// 公開範囲の外の指標は DB-09 が null にして返す（画面で隠すのではない）。個人の購買明細・他社の広告は読まない
import { BackendError } from "@kago/backend";
import type { Channel, DisclosureMetric } from "../domain/types.ts";
import { storeLabel } from "../domain/rules.ts";
import type { AppMetricsRow, ResultPlacement, ResultsRepository, SignageMetricsRow } from "../results/results.ts";
import { portalError, requireMaker, type PortalClient } from "./portal.ts";

type ApplicationRow = { id: string; ad_call_id: string };
type PlacementRow = { id: string; application_id: string; store_id: string; creative_version_id: string; channels: Channel[]; starts_at: string; ends_at: string; status: string };
type VersionRow = { id: string; creative_id: string; version: number; headline: string };
type CallRow = { id: string; title: string; disclosure_scope: DisclosureMetric[] };

async function rows<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw portalError(error);
  return (data ?? []) as T[];
}
const unique = (values: string[]) => [...new Set(values)];

export function createSupabaseResultsRepository(client: PortalClient): ResultsRepository {
  return {
    async listMakerResults(session, query) {
      // 画面のセッションではなく、Auth と所属（maker_members）でメーカー本人かを確かめる
      const identity = await requireMaker(client);
      if (session.role !== "maker_staff") throw new BackendError("forbidden");
      if (!Number.isFinite(Date.parse(query.start)) || !Number.isFinite(Date.parse(query.end)) || Date.parse(query.start) >= Date.parse(query.end)) {
        throw new Error("有効な集計期間を指定してください。");
      }
      const applications = await rows<ApplicationRow>(client.from("ad_applications").select("id,ad_call_id").in("maker_id", identity.makerIds));
      if (applications.length === 0) return { placements: [], app: [], signage: [] };

      let placementQuery = client.from("ad_placements")
        .select("id,application_id,store_id,creative_version_id,channels,starts_at,ends_at,status")
        .in("application_id", applications.map((a) => a.id));
      if (query.storeId) placementQuery = placementQuery.eq("store_id", query.storeId);
      const placements = await rows<PlacementRow>(placementQuery.order("approved_at", { ascending: false }).order("id"));
      if (placements.length === 0) return { placements: [], app: [], signage: [] };

      const versions = await rows<VersionRow>(client.from("creative_versions").select("id,creative_id,version,headline")
        .in("id", unique(placements.map((p) => p.creative_version_id))));
      const callIds = unique(placements.map((p) => applications.find((a) => a.id === p.application_id)!.ad_call_id));
      const [creatives, calls, stores] = await Promise.all([
        rows<{ id: string; product_id: string }>(client.from("creatives").select("id,product_id").in("id", unique(versions.map((v) => v.creative_id)))),
        rows<CallRow>(client.from("ad_calls").select("id,title,disclosure_scope").in("id", callIds)),
        rows<{ id: string; name: string; branch_name: string | null }>(client.from("stores").select("id,name,branch_name").in("id", unique(placements.map((p) => p.store_id)))),
      ]);
      const products = await rows<{ id: string; name: string }>(client.from("products").select("id,name").in("id", unique(creatives.map((c) => c.product_id))));

      const result: ResultPlacement[] = placements.flatMap((p) => {
        const call = calls.find((c) => c.id === applications.find((a) => a.id === p.application_id)?.ad_call_id);
        const version = versions.find((v) => v.id === p.creative_version_id);
        const creative = creatives.find((c) => c.id === version?.creative_id);
        const store = stores.find((s) => s.id === p.store_id);
        if (!call || !version || !creative || !store) return [];
        return [{
          id: p.id, store_id: p.store_id, store_name: storeLabel({ name: store.name, branch_name: store.branch_name ?? "" }),
          call_title: call.title, product_name: products.find((x) => x.id === creative.product_id)?.name ?? "",
          headline: version.headline, version: version.version, channels: p.channels,
          starts_at: p.starts_at, ends_at: p.ends_at, status: p.status, disclosure_scope: call.disclosure_scope ?? [],
        }];
      });

      // 期間指定つきの関数を使う（ビューを日ごとに足すと来店数が重複するため。DB-09）
      const params = { p_start: query.start, p_end: query.end, p_store_id: query.storeId ?? null };
      const [app, signage] = await Promise.all([
        rows<AppMetricsRow & { placement_type: string }>(client.rpc("kago_app_metrics", params)),
        rows<SignageMetricsRow>(client.rpc("kago_signage_metrics", params)),
      ]);
      const mine = new Set(result.map((p) => p.id));
      return {
        placements: result,
        app: app.filter((r) => r.placement_type === "sponsored" && r.ad_placement_id && mine.has(r.ad_placement_id)),
        signage: signage.filter((r) => r.ad_placement_id && mine.has(r.ad_placement_id)),
      };
    },
  };
}
