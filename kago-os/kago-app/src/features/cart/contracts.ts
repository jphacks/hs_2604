import type { ShoppingVisit } from "../shopping/service";

export type StoreProduct = { productId: string; code: string; name: string; category: string; price: number; available: boolean };
export type CartLine = StoreProduct & { quantity: number };
export type CartSnapshot = { visit: ShoppingVisit; cart: CartLine[] };
export type ProductPage = { products: StoreProduct[]; hasMore: boolean };
export type CartOperation = {
  requestId: string;
  visitId: string;
  expectedVersion: number;
  productId: string;
  quantity: number;
  source: "scan" | "manual";
};
export type PendingCart = { kind: "set"; operation: CartOperation } | {
  kind: "lookup";
  requestId: string;
  mutationId: string;
  visitId: string;
  expectedVersion: number;
  quantities: Record<string, number>;
  code?: string;
  productId?: string;
  failureReason?: string;
};

export const cartMessages: Record<string, string> = {
  scan_failed: "読み取りができませんでした。カメラを再試行するか、商品一覧・商品コード入力をご利用ください。",
  invalid_request: "入力内容を確認してください。数量は0〜999点で指定できます。",
  product_not_found: "この店舗に登録されていない商品です。商品一覧から選ぶか、店員へお尋ねください。",
  product_unavailable: "この商品は現在お取り扱いを停止しています。かごから削除できます。",
  cart_changed: "別の画面でかごが変更されました。最新のかごを確認して、もう一度操作してください。",
  request_conflict: "操作を確認できませんでした。かごを読み直して確認してください。",
  visit_ended: "この来店は終了しています。店舗・来店を選び直してください。",
  forbidden: "この買い物にはアクセスできません。ログインと来店を確認してください。",
  database_not_ready: "商品・かごの接続は準備中です。しばらくしてから再試行してください。",
  configuration_missing: "買い物機能の接続設定がまだありません。担当者へお問い合わせください。",
  configuration_invalid: "買い物機能の接続設定を確認する必要があります。",
  connection_failed: "通信が途切れました。保存結果を確認するため、同じ操作を再試行してください。",
};
