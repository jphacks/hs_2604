// Signage 端末の DB 版の窓口（SIG-01〜03）。端末のアカウント（signage 役割）でログインし、正式の RLS（DB-06）で読み書きする
// - 読むもの：自端末・自店・配信中の配信対象と販促の版・その素材の版・商品・店舗別価格・メーカー名（端末は停止中のものを読めない）
// - 書くもの：自端末の再生記録だけ（追加のみ。同じ id・同じ中身の再送は DB が無視する）
// 仮データへの切り替え・代わりの表示はしない（実接続の失敗は失敗として扱い、画面はキャッシュと案内で続ける）
import { BackendError, getBackendIdentity, signInBackend, toBackendError, type createBrowserBackend } from "@kago/backend";
import type {
  AdPlacement,
  Channel,
  Creative,
  CreativeVersion,
  Maker,
  MediaAsset,
  Product,
  Session,
  SignageDevice,
  SignagePlay,
  Store,
  StorePromotion,
  StoreProduct,
  TimeWindow,
} from "../domain/types";
import { parseCrowdSnapshot } from "../signage/crowd-selection";
import { buildFeed, type FeedSource, type SignageFeed } from "../signage/feed";

export type SignageClient = ReturnType<typeof createBrowserBackend>;
export type DeviceSession = Extract<Session, { role: "signage" }>;

type PlacementRow = Omit<AdPlacement, "status" | "suspend_reason"> & { status: string };
type VersionRow = { id: string; creative_id: string; version: number; image_path: string; headline: string; note: string | null; created_at: string };
type PromotionRow = { id: string; store_id: string; product_id: string };
type PromotionVersionRow = {
  id: string; promotion_id: string; version: number; channels: Channel[]; time_windows: TimeWindow[];
  priority: number; reason_text: string; starts_at: string; ends_at: string; status: "active" | "inactive";
};

/** 端末が読む DB の行（列名は DB のまま） */
export type SignageRows = {
  device: SignageDevice;
  store: { id: string; slug: string; name: string; branch_name: string | null; timezone: string };
  placements: PlacementRow[];
  versions: VersionRow[];
  creatives: Creative[];
  makers: Maker[];
  products: Product[];
  storeProducts: StoreProduct[];
  promotions: PromotionRow[];
  promotionVersions: PromotionVersionRow[];
};

const PLACEMENT_COLUMNS = "id,application_id,store_id,creative_version_id,channels,starts_at,ends_at,status,approved_by,approved_at";
const PROMOTION_VERSION_COLUMNS = "id,promotion_id,version,channels,time_windows,priority,reason_text,starts_at,ends_at,status";

/**
 * 素材の画像。DB の素材の版は image_path の1枚だけ（媒体別の素材・動画は COM-03 と Ads の合意後に別 migration）。
 * path は非公開 Storage の相対パスのまま持ち、表示するときに署名付き URL にする（signedUrl は保存しない）
 */
export function storageImage(imagePath: string): MediaAsset {
  return { kind: "image", path: imagePath, width: 1920, height: 1080, bytes: 0, file_name: imagePath.split("/").pop() ?? imagePath };
}

/** 公開フォルダ（/ad-assets/…）の素材か、Storage の相対パスか */
export const isStoragePath = (path: string) => !path.startsWith("/");

/** DB の行を、仮データ版と同じ配信内容の材料にする */
export function feedSourceFromRows(rows: SignageRows): FeedSource {
  const store: Store = { ...rows.store, branch_name: rows.store.branch_name ?? "", description: "", address: "" };
  const creative_versions: CreativeVersion[] = rows.versions.map((v) => ({
    id: v.id, creative_id: v.creative_id, version: v.version, headline: v.headline, note: v.note ?? "", created_at: v.created_at,
    assets: { signage: storageImage(v.image_path) },
  }));
  const promotions: StorePromotion[] = rows.promotionVersions.flatMap((pv) => {
    const sp = rows.promotions.find((p) => p.id === pv.promotion_id);
    return sp ? [{ ...pv, id: sp.id, version_id: pv.id, store_id: sp.store_id, product_id: sp.product_id }] : [];
  });
  return {
    device: rows.device,
    store,
    // expired・superseded は端末には見えない（RLS）。見えても配信しない
    placements: rows.placements.map((p) => ({ ...p, status: p.status === "active" ? "active" : "superseded" })),
    creatives: rows.creatives,
    creative_versions,
    makers: rows.makers,
    products: rows.products,
    store_products: rows.storeProducts,
    promotions,
  };
}

/** 送る行。received_at は DB が決める */
export function playRow(p: SignagePlay) {
  return {
    id: p.id, device_id: p.device_id, ad_placement_id: p.ad_placement_id, promotion_version_id: p.promotion_version_id,
    creative_version_id: p.creative_version_id, mode: p.mode, reason_code: p.reason_code, started_at: p.started_at,
    ended_at: p.ended_at, data_origin: p.data_origin, media_kind: p.media_kind, end_reason: p.end_reason,
  };
}

export function signageError(error: unknown): Error {
  const code = (error as { code?: string } | null)?.code;
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(code ?? "")) {
    return new Error("Signage のDB設定がまだ適用されていません。担当者に確認してください。");
  }
  return toBackendError(error);
}

/** 中身が DB の決まりに合わず、送り直しても通らない（制約・不正な値・権限） */
function isRejected(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code ?? "";
  return /^2[23]/.test(code) || code === "42501";
}

/** 今のログインが有効な端末か。端末の ID・店舗は Auth が検証した app_metadata から取る（URL や画面の値は使わない） */
export async function requireDevice(client: SignageClient): Promise<DeviceSession> {
  const identity = await getBackendIdentity(client, "signage");
  if (!identity.device) throw new BackendError("forbidden");
  return { role: "signage", deviceId: identity.device.deviceId, storeId: identity.device.storeId };
}

export async function signInDevice(client: SignageClient, email: string, password: string): Promise<DeviceSession> {
  await signInBackend(client, email, password, "signage");
  return requireDevice(client);
}

async function rowsOf<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw signageError(error);
  return (data ?? []) as T[];
}

const unique = (values: string[]) => [...new Set(values)];

export async function loadSignageRows(client: SignageClient, session: Session): Promise<SignageRows> {
  if (session.role !== "signage") throw new BackendError("forbidden");
  const [device] = await rowsOf<SignageDevice>(client.from("signage_devices")
    .select("id,store_id,slug,location").eq("id", session.deviceId).eq("is_active", true));
  // 停止した端末・別の店舗の端末は、RLS で行が見えない
  if (!device || device.store_id !== session.storeId) throw new BackendError("forbidden");
  const [store] = await rowsOf<SignageRows["store"]>(client.from("stores")
    .select("id,slug,name,branch_name,timezone").eq("id", device.store_id));
  if (!store) throw new BackendError("forbidden");

  const [placements, promotions, storeProducts] = await Promise.all([
    rowsOf<PlacementRow>(client.from("ad_placements").select(PLACEMENT_COLUMNS)
      .eq("store_id", store.id).eq("status", "active").order("approved_at").order("id")),
    rowsOf<PromotionRow>(client.from("store_promotions").select("id,store_id,product_id").eq("store_id", store.id).order("id")),
    rowsOf<StoreProduct>(client.from("store_products").select("store_id,product_id,price,is_active").eq("store_id", store.id)),
  ]);
  const versionIds = unique(placements.map((p) => p.creative_version_id));
  const promotionIds = promotions.map((p) => p.id);
  const [versions, promotionVersions] = await Promise.all([
    versionIds.length
      ? rowsOf<VersionRow>(client.from("creative_versions").select("id,creative_id,version,image_path,headline,note,created_at").in("id", versionIds))
      : [],
    promotionIds.length
      ? rowsOf<PromotionVersionRow>(client.from("promotion_versions").select(PROMOTION_VERSION_COLUMNS)
        .in("promotion_id", promotionIds).eq("status", "active"))
      : [],
  ]);
  const creativeIds = unique(versions.map((v) => v.creative_id));
  const creatives = creativeIds.length
    ? await rowsOf<Creative>(client.from("creatives").select("id,maker_id,product_id,created_at").in("id", creativeIds))
    : [];
  const makerIds = unique(creatives.map((c) => c.maker_id));
  const productIds = unique([...creatives.map((c) => c.product_id), ...promotions.map((p) => p.product_id)]);
  const [makers, products] = await Promise.all([
    makerIds.length ? rowsOf<Maker>(client.from("makers").select("id,slug,display_name,is_fictional").in("id", makerIds)) : [],
    productIds.length ? rowsOf<Product>(client.from("products").select("id,code,name,category").in("id", productIds)) : [],
  ]);
  return { device, store, placements, versions, creatives, makers, products, storeProducts, promotions, promotionVersions };
}

/** 端末の配信内容。デモ用の時刻は DB にまだないので、実時刻で判定する */
export async function loadSignageFeed(client: SignageClient, session: Session, now = new Date(), crowd = false): Promise<SignageFeed> {
  const rows=await loadSignageRows(client,session);
  let feed=buildFeed(feedSourceFromRows(rows),now,0);
  if(crowd){
    const {data,error}=await client.rpc("kago_signage_crowd");
    const snapshot=error?null:parseCrowdSnapshot(data,feed.device.store_id,new Set(rows.products.map(p=>p.category)));
    if(snapshot){
      const receivedAt=new Date();
      // The aggregate supplies authoritative store time; do not depend on the device clock.
      feed=buildFeed(feedSourceFromRows(rows),receivedAt,Date.parse(snapshot.observed_at)-receivedAt.getTime());
    }
    const categoryByKey:Record<string,string>={};
    for(const item of feed.items){
      const version=rows.versions.find(v=>v.id===item.creative_version_id);
      const creative=rows.creatives.find(c=>c.id===version?.creative_id);
      const product=rows.products.find(p=>p.id===creative?.product_id);
      if(product)categoryByKey[item.key]=product.category;
    }
    feed.crowd={snapshot,categoryByKey};
  }
  return feed;
}

/**
 * 終わった再生記録を追加する。まとめて送り、通らなければ1件ずつ送り直して、受け付けられない記録だけを返す。
 * 通信・ログインの失敗は投げる（端末に残して次に送る）
 */
export async function insertSignagePlays(client: SignageClient, session: Session, plays: SignagePlay[]): Promise<{ rejected: string[] }> {
  if (session.role !== "signage") throw new BackendError("forbidden");
  if (plays.some((p) => p.device_id !== session.deviceId || !p.ended_at)) throw new BackendError("forbidden");
  if (plays.length === 0) return { rejected: [] };
  const { error } = await client.from("signage_plays").insert(plays.map(playRow));
  if (!error) { return { rejected: await saveDecisions(client,plays) }; }
  if (!isRejected(error)) throw signageError(error);
  const rejected: string[] = [];
  for (const p of plays) {
    const { error: one } = await client.from("signage_plays").insert([playRow(p)]);
    if (!one) { rejected.push(...await saveDecisions(client,[p])); continue; }
    if (!isRejected(one)) throw signageError(one);
    rejected.push(p.id);
  }
  return { rejected };
}

async function saveDecisions(client:SignageClient,plays:SignagePlay[]){
 const rejected:string[]=[];
 for(const p of plays){
  if(!p.selection)continue;
  const {error}=await client.rpc("kago_record_signage_decision",{p_play_id:p.id,p_decision:p.selection});
  if(error){if(isRejected(error))rejected.push(p.id);else throw signageError(error);} // Retry transient failures with the same play ID.
 }
 return rejected;
}
