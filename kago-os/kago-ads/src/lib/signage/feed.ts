// Signage 端末に渡す配信内容（SIG-01）。DB の行から、端末が順に流す一覧を作る純粋な関数
// 個人のかご・履歴は使わない（共通仕様書 8.3。端末には店舗の配信対象・販促と素材だけを渡す）
import type {
  AdPlacement,
  Creative,
  CreativeVersion,
  Maker,
  MediaAsset,
  Product,
  SignageDevice,
  Store,
  StorePromotion,
  StoreProduct,
  Timestamp,
  TimeWindow,
} from "../domain/types";

/** 端末が取得した内容を使ってよい時間（COM-01 案 F：切断中は10分まで表示を続ける） */
export const CACHE_TTL_MS = 10 * 60 * 1000;

/** 案内（広告0件・期限切れ・素材なし）の画面。ADS-05 の汎用素材 */
export const FALLBACK_ASSET: MediaAsset = {
  kind: "image",
  path: "/ad-assets/FALLBACK_v1_signage.png",
  width: 1920,
  height: 1080,
  bytes: 0,
  file_name: "FALLBACK_v1_signage.png",
};

/** 店舗販促の背景。商品名・理由・価格は画面側で重ねる（docs/specs/ads-spec.md の 10 章） */
export const PROMO_TEMPLATE_ASSET: MediaAsset = {
  kind: "image",
  path: "/ad-assets/PROMO_TEMPLATE_v1_signage.png",
  width: 1920,
  height: 1080,
  bytes: 0,
  file_name: "PROMO_TEMPLATE_v1_signage.png",
};

/**
 * 提案：Signage の reason_code。共通仕様書 7 章の値（App 用）に、Signage の設定順と案内の理由を足す
 * - store_pick：店舗販促（INS-02 の優先度・時間帯）
 * - approved_order：メーカー広告（優先度の設定がないので承認順）
 * - no_content / cache_expired / media_unavailable：案内（mode = fallback）
 */
export type SignageReasonCode = "store_pick" | "approved_order" | "no_content" | "cache_expired" | "media_unavailable";

export type FeedItem = {
  /** 再生の単位。メーカー広告は配信対象の ID、店舗販促は版の ID */
  key: string;
  placement_type: "sponsored" | "store_promo";
  ad_placement_id: string | null;
  promotion_version_id: string | null;
  creative_version_id: string | null;
  asset: MediaAsset;
  product_name: string;
  /** 店舗別価格（DB-02）。取扱いがない商品は一覧に入れない */
  price: number;
  /** メーカー広告の「広告｜提供：〇〇」 */
  maker_name?: string;
  /** 店舗販促の理由文 */
  reason_text?: string;
  reason_code: SignageReasonCode;
  /** これより後は出さない（期間の終わりと時間帯の終わりの早い方。店舗の時刻） */
  valid_until: Timestamp;
};

export type SignageFeed = {
  device: SignageDevice;
  store_name: string;
  /** 取得した時刻と、使ってよい期限（端末の実時刻） */
  fetched_at: Timestamp;
  expires_at: Timestamp;
  /** 店舗の時刻 − 実時刻（ミリ秒）。デモ用の時刻を使うとき 0 以外になる */
  clock_offset_ms: number;
  items: FeedItem[];
  /** 自店で停止中の配信対象・販促。再生中ならすぐ切り替える（COM-01 案 F） */
  suspended_keys: string[];
  /** 一覧に入れなかったもの（確認画面用） */
  skipped: { key: string; reason: string }[];
};

export type FeedSource = {
  device: SignageDevice;
  store: Store;
  placements: AdPlacement[];
  creatives: Creative[];
  creative_versions: CreativeVersion[];
  makers: Maker[];
  products: Product[];
  store_products: StoreProduct[];
  promotions: StorePromotion[];
};

const ms = (ts: Timestamp) => Date.parse(ts);

/** 店舗の時刻（日本時間）の日付・時刻・ISO 曜日 */
export function localParts(storeNow: Date): { date: string; hm: string; weekday: number } {
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(storeNow);
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(storeNow);
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return { date, hm, weekday: day === 0 ? 7 : day };
}

/** 店舗の時刻での「時」（0〜23）。集計の時間帯（共通仕様書 9.3）に使う */
export function hourOf(storeNow: Date): number {
  return Number(localParts(storeNow).hm.slice(0, 2));
}

/** 時間帯の中なら、その時間帯が終わる時刻を返す。外なら null。空の時間帯は終日（翌日0時まで） */
export function windowEnd(windows: TimeWindow[], storeNow: Date): Date | null {
  const { date, hm, weekday } = localParts(storeNow);
  if (windows.length === 0) return new Date(Date.parse(`${date}T00:00:00+09:00`) + 86_400_000);
  const w = windows.find((x) => x.weekdays.includes(weekday) && x.start <= hm && hm < x.end);
  if (!w) return null;
  return w.end === "24:00" ? new Date(Date.parse(`${date}T00:00:00+09:00`) + 86_400_000) : new Date(`${date}T${w.end}:00+09:00`);
}

/** 期間は [starts_at, ends_at)（database-design.md） */
const inPeriod = (start: Timestamp, end: Timestamp, now: Date) => ms(start) <= now.getTime() && now.getTime() < ms(end);
const earlier = (a: Timestamp, b: Date): Timestamp => (ms(a) <= b.getTime() ? a : b.toISOString());

/**
 * 配信内容を作る。順序は「メーカー広告（承認順）」と「店舗販促（優先度順）」を交互に並べる（提案。
 * 共通仕様書 11.2 No.7 の PL1・SP1 の交互表示に合わせた。INS-02 の優先度を広告にも使うかは INS-02 と決める）
 */
export function buildFeed(src: FeedSource, realNow: Date, clockOffsetMs = 0): SignageFeed {
  const storeNow = new Date(realNow.getTime() + clockOffsetMs);
  const storeId = src.device.store_id;
  const skipped: SignageFeed["skipped"] = [];
  const price = (productId: string) => src.store_products.find((p) => p.store_id === storeId && p.product_id === productId && p.is_active)?.price;
  const productName = (productId: string) => src.products.find((p) => p.id === productId)?.name ?? "";

  const ads: FeedItem[] = [];
  for (const p of [...src.placements].sort((a, b) => ms(a.approved_at) - ms(b.approved_at))) {
    if (p.store_id !== storeId || p.status !== "active" || !p.channels.includes("signage")) continue;
    if (!inPeriod(p.starts_at, p.ends_at, storeNow)) {
      skipped.push({ key: p.id, reason: "配信期間の外" });
      continue;
    }
    const version = src.creative_versions.find((v) => v.id === p.creative_version_id);
    const creative = version && src.creatives.find((c) => c.id === version.creative_id);
    const asset = version?.assets.signage;
    if (!version || !creative || !asset) {
      skipped.push({ key: p.id, reason: "Signage 用の素材がない" });
      continue;
    }
    const yen = price(creative.product_id);
    if (yen === undefined) {
      skipped.push({ key: p.id, reason: "この店舗で取扱いがない商品" });
      continue;
    }
    ads.push({
      key: p.id,
      placement_type: "sponsored",
      ad_placement_id: p.id,
      promotion_version_id: null,
      creative_version_id: version.id,
      asset,
      product_name: productName(creative.product_id),
      price: yen,
      maker_name: src.makers.find((m) => m.id === creative.maker_id)?.display_name ?? "",
      reason_code: "approved_order",
      valid_until: p.ends_at,
    });
  }

  const promos: FeedItem[] = [];
  for (const sp of [...src.promotions].sort((a, b) => b.priority - a.priority || a.version_id.localeCompare(b.version_id))) {
    if (sp.store_id !== storeId || sp.status !== "active" || !sp.channels.includes("signage")) continue;
    if (!inPeriod(sp.starts_at, sp.ends_at, storeNow)) {
      skipped.push({ key: sp.version_id, reason: "販促の期間の外" });
      continue;
    }
    const until = windowEnd(sp.time_windows, storeNow);
    if (!until) {
      skipped.push({ key: sp.version_id, reason: "販促の時間帯の外" });
      continue;
    }
    const yen = price(sp.product_id);
    if (yen === undefined) {
      skipped.push({ key: sp.version_id, reason: "この店舗で取扱いがない商品" });
      continue;
    }
    promos.push({
      key: sp.version_id,
      placement_type: "store_promo",
      ad_placement_id: null,
      promotion_version_id: sp.version_id,
      creative_version_id: null,
      asset: PROMO_TEMPLATE_ASSET,
      product_name: productName(sp.product_id),
      price: yen,
      reason_text: sp.reason_text,
      reason_code: "store_pick",
      valid_until: earlier(sp.ends_at, until),
    });
  }

  const items: FeedItem[] = [];
  for (let i = 0; i < Math.max(ads.length, promos.length); i++) {
    if (ads[i]) items.push(ads[i]);
    if (promos[i]) items.push(promos[i]);
  }

  const suspended_keys = [
    ...src.placements.filter((p) => p.store_id === storeId && p.status === "suspended").map((p) => p.id),
    ...src.promotions.filter((p) => p.store_id === storeId && p.status === "inactive").map((p) => p.version_id),
  ];

  return {
    device: src.device,
    store_name: src.store.branch_name ? `${src.store.name} ${src.store.branch_name}` : src.store.name,
    fetched_at: realNow.toISOString(),
    expires_at: new Date(realNow.getTime() + CACHE_TTL_MS).toISOString(),
    clock_offset_ms: clockOffsetMs,
    items,
    suspended_keys,
    skipped,
  };
}
