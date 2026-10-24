// 仮データ（DATA-01 の Ads・Signage 分の下書き）。共通仕様書 11 章の架空例に合わせる
// 日付は今日を基準に作るので、いつ開いても募集中の募集がある。ID は読みやすさのための略号（DB では UUID）
// 共通仕様書にないもの（2店舗目・確認用メーカー）は、ADS-01 の「2店舗以上の比較」と権限の確認のための提案（Q-08）
import { addDays, dayEnd, dayStart, today } from "../../lib/domain/rules";
import type {
  AdApplication,
  AdCall,
  AdPlacement,
  Creative,
  CreativeVersion,
  DisclosureMetric,
  Maker,
  MediaAsset,
  Product,
  SignageDevice,
  Store,
  StoreProduct,
} from "../../lib/domain/types";

export type MockDb = {
  version: 2;
  stores: Store[];
  signage_devices: SignageDevice[];
  makers: Maker[];
  products: Product[];
  store_products: StoreProduct[];
  ad_calls: AdCall[];
  creatives: Creative[];
  creative_versions: CreativeVersion[];
  ad_applications: AdApplication[];
  ad_placements: AdPlacement[];
};

/** kago-app の既存商品（src/data/demo/products.json・src/lib/products.ts）と、DATA-01 で追加する P-SAUCE */
const PRODUCT_ROWS: [string, string, string, number][] = [
  ["2900000000018", "KAGO 緑茶 500ml", "飲料", 138],
  ["2900000000025", "KAGO 天然水 550ml", "飲料", 98],
  ["2900000000032", "KAGO カフェラテ", "飲料", 178],
  ["2900000000049", "成分無調整牛乳 1L", "乳製品", 238],
  ["2900000000056", "もっちり食パン 6枚切", "パン", 228],
  ["2900000000063", "新鮮たまご 10個", "卵", 298],
  ["2900000000070", "プレーンヨーグルト", "乳製品", 188],
  ["2900000000087", "フィリピン産バナナ", "青果", 198],
  ["2900000000094", "中辛ビーフカレー", "加工食品", 258],
  ["2900000000100", "スパゲッティ 500g", "乾麺", 248],
  ["2900000000117", "うすしおポテトチップス", "菓子", 178],
  ["2900000000124", "ミルクチョコレート", "菓子", 158],
  ["2900000000131", "箱ティッシュ 5個組", "日用品", 398],
  ["2900000000148", "液体洗濯洗剤 詰替", "日用品", 498],
  ["2900000000155", "不織布マスク 30枚", "衛生用品", 598],
  ["2900000000162", "トマトパスタソース", "調味料", 298],
  ["PLU-1001", "玉ねぎ 1個", "青果", 78],
  ["PLU-1002", "国産りんご 1個", "青果", 158],
  ["PLU-1003", "アボカド 1個", "青果", 198],
  ["PLU-2001", "お店のコロッケ 1個", "惣菜", 98],
  ["PLU-2002", "若鶏の唐揚げ 100g", "惣菜", 218],
  ["PLU-3001", "焼きたて塩パン 1個", "パン", 130],
];

export const productId = (code: string) => `prod-${code}`;

const ALL_METRICS: DisclosureMetric[] = ["impressions", "clicks", "cart_adds", "purchases", "signage_views"];

const image = (file: string, channel: "app" | "signage", kb: number): MediaAsset => ({
  kind: "image",
  path: `/ad-assets/${file}`,
  width: channel === "app" ? 800 : 1920,
  height: channel === "app" ? 800 : 1080,
  bytes: kb * 1024,
  file_name: file,
});

export function createSeed(on: string = today()): MockDb {
  const d = (n: number) => addDays(on, n);
  const at = (n: number, hm = "10:00") => `${d(n)}T${hm}:00+09:00`;

  const stores: Store[] = [
    {
      id: "S1", slug: "hiroshima-demo-store", name: "広島デモ店", branch_name: "", timezone: "Asia/Tokyo",
      description: "住宅地にある店舗。夕方は仕事帰りの買い物客、週末は家族連れが多い。",
      address: "広島県広島市（架空）",
    },
    {
      id: "S2", slug: "hiroshima-station-demo-store", name: "広島デモ店", branch_name: "駅前店", timezone: "Asia/Tokyo",
      description: "駅前の小型店舗（ADS-01 の比較・権限の確認用に追加した架空の店舗）。",
      address: "広島県広島市（架空）",
    },
  ];

  const signage_devices: SignageDevice[] = [
    { id: "D1", store_id: "S1", slug: "hiroshima-demo-entrance", location: "入口" },
    { id: "D2", store_id: "S1", slug: "hiroshima-demo-pasta-shelf", location: "パスタ・調味料の棚" },
    { id: "D3", store_id: "S2", slug: "hiroshima-station-entrance", location: "入口" },
  ];

  const makers: Maker[] = [
    { id: "M1", slug: "setouchi-tomato-foods", display_name: "瀬戸内トマト食品", is_fictional: true },
    { id: "M2", slug: "check-maker", display_name: "確認用メーカー（架空）", is_fictional: true },
  ];

  const products: Product[] = PRODUCT_ROWS.map(([code, name, category]) => ({ id: productId(code), code, name, category }));
  // 駅前店は一部の商品を別の価格にして、店舗別価格を確かめられるようにする
  const store_products: StoreProduct[] = stores.flatMap((s) =>
    PRODUCT_ROWS.map(([code, , , price]) => ({
      store_id: s.id,
      product_id: productId(code),
      price: s.id === "S2" && code === "2900000000162" ? 278 : price,
      is_active: true,
    })),
  );

  const ad_calls: AdCall[] = [
    {
      id: "C1", store_id: "S1", title: "パスタ関連商品の広告募集", categories: ["乾麺", "調味料"], channels: ["app", "signage"],
      starts_at: dayStart(d(-1)), ends_at: dayEnd(d(36)), status: "open", disclosure_scope: ALL_METRICS,
      description: "パスタ・調味料の棚の前にあるサイネージと、App のおすすめ枠で、パスタと一緒に使う商品の広告を募集します。",
      created_at: at(-3), updated_at: at(-3),
    },
    {
      id: "C2", store_id: "S1", title: "惣菜・パン売り場のサイネージ", categories: ["惣菜", "パン"], channels: ["signage"],
      starts_at: dayStart(d(0)), ends_at: dayEnd(d(60)), status: "open", disclosure_scope: ["signage_views"],
      description: "入口のサイネージで、夕方の惣菜・パンに合う商品の広告を募集します。動画（15秒以内）も可。",
      created_at: at(-2), updated_at: at(-2),
    },
    {
      id: "C3", store_id: "S2", title: "駅前店 日用品の広告募集", categories: ["日用品"], channels: ["app", "signage"],
      starts_at: dayStart(d(-30)), ends_at: dayEnd(d(-1)), status: "open", disclosure_scope: ALL_METRICS,
      description: "日用品フェアに合わせた広告枠です。",
      created_at: at(-35), updated_at: at(-35),
    },
    {
      id: "C4", store_id: "S2", title: "駅前店 App おすすめ枠", categories: ["調味料", "乳製品"], channels: ["app"],
      starts_at: dayStart(d(3)), ends_at: dayEnd(d(45)), status: "open", disclosure_scope: ["impressions", "clicks"],
      description: "通勤帰りのお客様向けに、App のおすすめ枠で広告を募集します。",
      created_at: at(-1), updated_at: at(-1),
    },
    {
      id: "C5", store_id: "S1", title: "年末の売り場企画（下書き）", categories: ["調味料"], channels: ["app", "signage"],
      starts_at: dayStart(d(40)), ends_at: dayEnd(d(70)), status: "draft", disclosure_scope: ALL_METRICS,
      description: "内容を検討中。", created_at: at(-1), updated_at: at(-1),
    },
    {
      id: "C6", store_id: "S2", title: "秋の飲料キャンペーン", categories: ["飲料"], channels: ["signage"],
      starts_at: dayStart(d(-20)), ends_at: dayEnd(d(10)), status: "closed", disclosure_scope: [],
      description: "応募が集まったため募集を終了しました。", created_at: at(-25), updated_at: at(-5),
    },
  ];

  const creatives: Creative[] = [{ id: "CR1", maker_id: "M1", product_id: productId("2900000000162"), created_at: at(-3) }];

  const creative_versions: CreativeVersion[] = [
    {
      id: "CR1-v1", creative_id: "CR1", version: 1, headline: "ゆでたパスタに、かけるだけ。", note: "初版", created_at: at(-3),
      assets: { app: image("CR1_v1_app.png", "app", 54), signage: image("CR1_v1_signage.png", "signage", 130) },
    },
    {
      id: "CR1-v2", creative_id: "CR1", version: 2, headline: "ゆでたパスタに、かけるだけ。",
      note: "商品名を大きくし、Signage を10秒の動画にした", created_at: at(-2),
      assets: {
        app: image("CR1_v2_app.png", "app", 54),
        signage: { kind: "video", path: "/ad-assets/CR1_v2_signage.mp4", width: 1920, height: 1080, bytes: 401 * 1024, duration_sec: 10, file_name: "CR1_v2_signage.mp4" },
      },
    },
  ];

  // 共通仕様書 11.2 の No.2〜5：第1版を却下 → 第2版で再申請 → 承認
  const a1: AdApplication = {
    id: "A1", ad_call_id: "C1", store_id: "S1", maker_id: "M1", creative_id: "CR1",
    creative_version_id: "CR1-v2", channels: ["app", "signage"], requested_start: dayStart(d(-1)), requested_end: dayEnd(d(36)),
    status: "approved", created_at: at(-3), updated_at: at(-1, "15:00"),
    revisions: [
      {
        rev: 1, creative_version_id: "CR1-v1", channels: ["app", "signage"], requested_start: dayStart(d(-1)), requested_end: dayEnd(d(36)),
        message: "パスタと一緒に買われやすいソースです。", submitted_at: at(-3), status: "rejected",
        review_comment: "商品名がサイネージの離れた位置から読みにくいので、大きくしてください。", reviewed_at: at(-2, "09:00"),
      },
      {
        rev: 2, creative_version_id: "CR1-v2", channels: ["app", "signage"], requested_start: dayStart(d(-1)), requested_end: dayEnd(d(36)),
        message: "商品名を大きくしました。", submitted_at: at(-2, "13:00"), status: "approved", reviewed_at: at(-1, "15:00"),
      },
    ],
  };
  // 審査待ちの例（確認用の審査画面で試す）
  const a2: AdApplication = {
    id: "A2", ad_call_id: "C2", store_id: "S1", maker_id: "M1", creative_id: "CR1",
    creative_version_id: "CR1-v2", channels: ["signage"], requested_start: dayStart(d(1)), requested_end: dayEnd(d(30)),
    status: "submitted", created_at: at(0, "08:00"), updated_at: at(0, "08:00"),
    revisions: [
      {
        rev: 1, creative_version_id: "CR1-v2", channels: ["signage"], requested_start: dayStart(d(1)), requested_end: dayEnd(d(30)),
        message: "入口の画面で、夕方の惣菜と一緒に案内したいです。", submitted_at: at(0, "08:00"), status: "submitted",
      },
    ],
  };

  const ad_placements: AdPlacement[] = [
    {
      id: "PL1", application_id: "A1", store_id: "S1", creative_version_id: "CR1-v2", channels: ["app", "signage"],
      starts_at: dayStart(d(-1)), ends_at: dayEnd(d(36)), status: "active", approved_by: "store_staff:S1", approved_at: at(-1, "15:00"),
    },
  ];

  return {
    version: 2, stores, signage_devices, makers, products, store_products, ad_calls, creatives, creative_versions,
    ad_applications: [a1, a2], ad_placements,
  };
}
