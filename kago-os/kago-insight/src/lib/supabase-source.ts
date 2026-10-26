import "server-only";

import { getAdImageUrl, getAdMediaPaths } from "@kago/backend";
import { indexBy, num, parseRange, toIso, uniqueIds } from "./pg";
import { requireStoreSession } from "./store";
import type {
  AppMetricRow,
  Application,
  ApplicationRevision,
  Channel,
  OrderTotals,
  Placement,
  Product,
  Promotion,
  SelectionCount,
  SignageMetricRow,
  TimeWindow,
} from "./types";

/**
 * 共通DBからの取得。画面はこのファイルを直接呼ばず data-source.ts を経由する。
 *
 * 店舗の絞り込みは RLS と security definer 関数の側で効いているが、
 * 取得側でも store_id を明示する。どの店舗を見ているかをコード上で追えるようにするため。
 */

/** 集計の既定期間。指標画面が期間を持つまでの暫定値（INS-08 で画面から指定できるようにする） */
export function defaultRange(): { start: string; end: string } {
  const now = Date.now();
  return {
    start: new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString(),
    end: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
  };
}

function fail(context: string, error: { message?: string } | null): never {
  throw new Error(`${context}の取得に失敗しました: ${error?.message ?? "原因不明"}`);
}

/* ------------------------------------------------------------------ */
/* 申請と配信                                                           */
/* ------------------------------------------------------------------ */

export async function fetchApplications(): Promise<Application[]> {
  const { client, store } = await requireStoreSession();

  const { data: rows, error } = await client
    .from("ad_applications")
    .select(
      "id, ad_call_id, maker_id, creative_id, creative_version_id, channels, requested_period, message, revision, status, review_comment, created_at",
    )
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });
  if (error) fail("申請一覧", error);
  const applications = rows ?? [];
  if (applications.length === 0) return [];

  const { data: revisionRows, error: revisionError } = await client
    .from("application_revisions")
    .select(
      "application_id, revision, creative_version_id, channels, requested_period, submitted_at, status, review_comment, reviewed_at",
    )
    .in("application_id", applications.map((row) => row.id));
  if (revisionError) fail("申請履歴", revisionError);
  const revisions = revisionRows ?? [];

  // 関連は埋め込みではなく別クエリで引く。複合外部キーの関係名に依存したくないため。
  const [calls, makers, creatives, versions] = await Promise.all([
    select(client, "ad_calls", "id, title", uniqueIds(applications.map((r) => r.ad_call_id)), "募集"),
    select(client, "makers", "id, display_name, is_fictional", uniqueIds(applications.map((r) => r.maker_id)), "メーカー"),
    select(client, "creatives", "id, product_id", uniqueIds(applications.map((r) => r.creative_id)), "素材"),
    select(
      client,
      "creative_versions",
      "id, creative_id, version, image_path, headline",
      uniqueIds([
        ...applications.map((r) => r.creative_version_id),
        ...revisions.map((r) => r.creative_version_id),
      ]),
      "素材の版",
    ),
  ]);
  const products = await select(
    client,
    "products",
    "id, name, code",
    uniqueIds(creatives.map((r) => r.product_id as string)),
    "商品",
  );

  const callById = indexBy(calls, "id");
  const makerById = indexBy(makers, "id");
  const creativeById = indexBy(creatives, "id");
  const versionById = indexBy(versions, "id");
  const productById = indexBy(products, "id");

  const media=await getAdMediaPaths(client,versions.map(v=>({id:v.id as string,image_path:v.image_path as string})));
  const imageUrls=new Map<string,string>();
  await Promise.all([...new Set([...media.paths.values()].flatMap(v=>Object.values(v)))].map(async path=>{
    try {imageUrls.set(path,(await getAdImageUrl(client,path)).url);}catch{/* UI offers an explicit retry. */}
  }));
  const mediaOf=(id:string)=>Object.fromEntries(Object.entries(media.paths.get(id)??{}).map(([channel,path])=>[channel,{path,url:imageUrls.get(path)??null}]));

  const historyOf = (applicationId: string): ApplicationRevision[] =>
    revisions
      .filter((row) => row.application_id === applicationId)
      .sort((a, b) => (a.revision as number) - (b.revision as number))
      .map((row) => {
        const version = versionById.get(row.creative_version_id);
        return {
          revision: row.revision as number,
          creative_version_id: row.creative_version_id as string,
          creative_version: (version?.version as number) ?? 0,
          image_path: (version?.image_path as string) ?? "",
          headline: (version?.headline as string) ?? "",
          channels: row.channels as Channel[],
          requested_period: parseRange(row.requested_period as string),
          submitted_at: toIso(row.submitted_at as string),
          status: row.status as ApplicationRevision["status"],
          review_comment: (row.review_comment as string | null) ?? null,
          reviewed_at: row.reviewed_at ? toIso(row.reviewed_at as string) : null,
        };
      });

  return applications.map((row) => {
    const version = versionById.get(row.creative_version_id);
    const creative = creativeById.get(row.creative_id);
    const product = creative ? productById.get(creative.product_id as string) : undefined;
    const imagePath = (version?.image_path as string) ?? "";
    return {
      id: row.id as string,
      ad_call_id: row.ad_call_id as string,
      ad_call_title: (callById.get(row.ad_call_id)?.title as string) ?? "（募集名なし）",
      maker_id: row.maker_id as string,
      maker_display_name: (makerById.get(row.maker_id)?.display_name as string) ?? "（メーカー名なし）",
      maker_is_fictional: Boolean(makerById.get(row.maker_id)?.is_fictional ?? true),
      creative_id: row.creative_id as string,
      creative_version_id: row.creative_version_id as string,
      creative_version: (version?.version as number) ?? 0,
      image_path: imagePath,
      image_url: imageUrls.get(imagePath) ?? null,
      media_images: mediaOf(row.creative_version_id as string),
      headline: (version?.headline as string) ?? "",
      product_id: (creative?.product_id as string) ?? "",
      product_name: (product?.name as string) ?? "（商品名なし）",
      product_code: (product?.code as string) ?? "",
      channels: row.channels as Channel[],
      requested_period: parseRange(row.requested_period as string),
      message: (row.message as string | null) ?? null,
      revision: row.revision as number,
      status: row.status as Application["status"],
      review_comment: (row.review_comment as string | null) ?? null,
      submitted_at: toIso(row.created_at as string),
      history: historyOf(row.id as string),
    };
  });
}

export async function fetchPlacements(): Promise<Placement[]> {
  const { client, store } = await requireStoreSession();

  const { data: rows, error } = await client
    .from("ad_placements")
    .select(
      "id, application_id, revision, store_id, creative_version_id, channels, starts_at, ends_at, status, approved_by, approved_at, suspend_reason, suspended_at",
    )
    .eq("store_id", store.id)
    .order("approved_at", { ascending: false });
  if (error) fail("配信一覧", error);
  const placements = rows ?? [];
  if (placements.length === 0) return [];

  const versions = await select(
    client,
    "creative_versions",
    "id, creative_id",
    uniqueIds(placements.map((row) => row.creative_version_id)),
    "素材の版",
  );
  const creatives = await select(
    client,
    "creatives",
    "id, product_id, maker_id",
    uniqueIds(versions.map((row) => row.creative_id as string)),
    "素材",
  );
  const [products, makers] = await Promise.all([
    select(client, "products", "id, name", uniqueIds(creatives.map((r) => r.product_id as string)), "商品"),
    select(client, "makers", "id, display_name", uniqueIds(creatives.map((r) => r.maker_id as string)), "メーカー"),
  ]);
  const versionById = indexBy(versions, "id");
  const creativeById = indexBy(creatives, "id");
  const productById = indexBy(products, "id");
  const makerById = indexBy(makers, "id");

  return placements.map((row) => {
    const creative = creativeById.get(versionById.get(row.creative_version_id)?.creative_id as string);
    return {
      id: row.id as string,
      application_id: row.application_id as string,
      revision: row.revision as number,
      store_id: row.store_id as string,
      creative_version_id: row.creative_version_id as string,
      product_name: (productById.get(creative?.product_id as string)?.name as string) ?? "（商品名なし）",
      maker_display_name: (makerById.get(creative?.maker_id as string)?.display_name as string) ?? "（メーカー名なし）",
      channels: row.channels as Channel[],
      starts_at: toIso(row.starts_at as string),
      ends_at: toIso(row.ends_at as string),
      status: row.status as Placement["status"],
      approved_by: row.approved_by as string,
      approved_at: toIso(row.approved_at as string),
      suspend_reason: (row.suspend_reason as string | null) ?? null,
      suspended_at: row.suspended_at ? toIso(row.suspended_at as string) : null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* 店舗販促と商品                                                       */
/* ------------------------------------------------------------------ */

export async function fetchPromotions(): Promise<Promotion[]> {
  const { client, store } = await requireStoreSession();

  const { data: promotionRows, error } = await client
    .from("store_promotions")
    .select("id, store_id, product_id")
    .eq("store_id", store.id);
  if (error) fail("販促一覧", error);
  const promotions = promotionRows ?? [];
  if (promotions.length === 0) return [];

  const { data: versionRows, error: versionError } = await client
    .from("promotion_versions")
    .select("id, promotion_id, version, channels, time_windows, priority, reason_text, starts_at, ends_at, status")
    .in("promotion_id", promotions.map((row) => row.id))
    .eq("status", "active");
  if (versionError) fail("販促の版", versionError);
  const versions = versionRows ?? [];

  const products = await select(
    client,
    "products",
    "id, name, code",
    uniqueIds(promotions.map((row) => row.product_id as string)),
    "商品",
  );
  const productById = indexBy(products, "id");

  // 有効な版が無い販促は画面に出さない。停止済みのものを設定中に見せないため。
  return versions.map((version) => {
    const promotion = promotions.find((row) => row.id === version.promotion_id);
    const product = productById.get(promotion?.product_id as string);
    return {
      id: promotion?.id as string,
      store_id: store.id,
      product_id: (promotion?.product_id as string) ?? "",
      product_name: (product?.name as string) ?? "（商品名なし）",
      product_code: (product?.code as string) ?? "",
      promotion_version_id: version.id as string,
      version: version.version as number,
      channels: version.channels as Channel[],
      time_windows: (version.time_windows as TimeWindow[]) ?? [],
      priority: version.priority as number,
      reason_text: version.reason_text as string,
      starts_at: toIso(version.starts_at as string),
      ends_at: toIso(version.ends_at as string),
      status: version.status as Promotion["status"],
    };
  });
}

export async function fetchProducts(): Promise<Product[]> {
  const { client, store } = await requireStoreSession();

  const { data: rows, error } = await client
    .from("store_products")
    .select("product_id, price")
    .eq("store_id", store.id)
    .eq("is_active", true);
  if (error) fail("取扱商品", error);
  const storeProducts = rows ?? [];
  if (storeProducts.length === 0) return [];

  const products = await select(
    client,
    "products",
    "id, name, code, category",
    uniqueIds(storeProducts.map((row) => row.product_id as string)),
    "商品",
  );
  const productById = indexBy(products, "id");

  return storeProducts
    .map((row) => {
      const product = productById.get(row.product_id as string);
      if (!product) return null;
      return {
        product_id: row.product_id as string,
        code: product.code as string,
        name: product.name as string,
        price: (num(row.price) ?? 0),
        category: product.category as string,
      };
    })
    .filter((row): row is Product => row !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

/* ------------------------------------------------------------------ */
/* 指標（DB-09）                                                        */
/* ------------------------------------------------------------------ */

export async function fetchAppMetrics(): Promise<AppMetricRow[]> {
  const { client, store } = await requireStoreSession();
  const { start, end } = defaultRange();
  const { data, error } = await client.rpc("kago_app_metrics", {
    p_start: start,
    p_end: end,
    p_store_id: store.id,
    p_data_origin: null,
  });
  if (error) fail("アプリの指標", error);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    store_id: row.store_id as string,
    channel: "app",
    data_origin: row.data_origin as AppMetricRow["data_origin"],
    placement_type: row.placement_type as AppMetricRow["placement_type"],
    ad_placement_id: (row.ad_placement_id as string | null) ?? null,
    promotion_version_id: (row.promotion_version_id as string | null) ?? null,
    rule_version: num(row.rule_version),
    impressions: num(row.impressions),
    shown_visits: num(row.shown_visits),
    clicks: num(row.clicks),
    recommendation_adds: num(row.recommendation_adds),
    adds_after_impression: num(row.adds_after_impression),
    recommendation_removes: num(row.recommendation_removes),
    purchases: num(row.purchases),
    purchased_quantity: num(row.purchased_quantity),
    purchase_amount: num(row.purchase_amount),
    // 少数判定は DB 側の計算をそのまま使う。画面で閾値を持たない。
    small_sample: (row.small_sample as boolean | null) ?? null,
    disclosed_metrics: (row.disclosed_metrics as string[]) ?? [],
  }));
}

export async function fetchSignageMetrics(): Promise<SignageMetricRow[]> {
  const { client, store } = await requireStoreSession();
  const { start, end } = defaultRange();
  const { data, error } = await client.rpc("kago_signage_metrics", {
    p_start: start,
    p_end: end,
    p_store_id: store.id,
    p_data_origin: null,
  });
  if (error) fail("サイネージの指標", error);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    store_id: row.store_id as string,
    channel: "signage",
    data_origin: row.data_origin as SignageMetricRow["data_origin"],
    device_id: row.device_id as string,
    hour_start: toIso(row.hour_start as string),
    ad_placement_id: (row.ad_placement_id as string | null) ?? null,
    promotion_version_id: (row.promotion_version_id as string | null) ?? null,
    mode: row.mode as SignageMetricRow["mode"],
    plays: num(row.plays),
    play_seconds: num(row.play_seconds),
    measured_plays: num(row.measured_plays),
    not_measured_plays: num(row.not_measured_plays),
    error_plays: num(row.error_plays),
    estimated_viewers: num(row.estimated_viewers),
    estimated_view_seconds: num(row.estimated_view_seconds),
    synthetic_estimates: num(row.synthetic_estimates),
    synthetic_viewers: num(row.synthetic_viewers),
    synthetic_view_seconds: num(row.synthetic_view_seconds),
    reference_sales_quantity: num(row.reference_sales_quantity),
    disclosed_metrics: (row.disclosed_metrics as string[]) ?? [],
  }));
}

export async function fetchOrderTotals(): Promise<OrderTotals[]> {
  const { client, store } = await requireStoreSession();
  const { start, end } = defaultRange();
  const { data, error } = await client.rpc("kago_order_totals", {
    p_start: start,
    p_end: end,
    p_store_id: store.id,
  });
  if (error) fail("購入の合計", error);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    data_origin: row.data_origin as OrderTotals["data_origin"],
    orders: num(row.orders) ?? 0,
    quantity: num(row.quantity) ?? 0,
    amount: num(row.amount) ?? 0,
  }));
}

export async function fetchSelectionCounts(): Promise<SelectionCount[]> {
  const { client, store } = await requireStoreSession();
  const { data, error } = await client
    .from("kago_selection_counts")
    .select("store_id, day_jst, placement_type, ad_placement_id, promotion_version_id, rule_version, data_origin, selected_slots")
    .eq("store_id", store.id);
  if (error) fail("選定枠数", error);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    store_id: row.store_id as string,
    day_jst: toIso(row.day_jst as string),
    placement_type: row.placement_type as SelectionCount["placement_type"],
    ad_placement_id: (row.ad_placement_id as string | null) ?? null,
    promotion_version_id: (row.promotion_version_id as string | null) ?? null,
    rule_version: num(row.rule_version),
    data_origin: "unclassified",
    selected_slots: num(row.selected_slots) ?? 0,
  }));
}

/* ------------------------------------------------------------------ */

type Row = Record<string, unknown> & { id: string };

/** id の集合でまとめて引く小さな補助。空配列のときは問い合わせない */
async function select(
  client: Awaited<ReturnType<typeof requireStoreSession>>["client"],
  table: string,
  columns: string,
  ids: string[],
  label: string,
): Promise<Row[]> {
  if (ids.length === 0) return [];
  const { data, error } = await client.from(table).select(columns).in("id", ids);
  if (error) fail(label, error);
  return (data ?? []) as unknown as Row[];
}
