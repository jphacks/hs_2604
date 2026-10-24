export type SettingKey = "usePurchaseHistory" | "useCurrentCart";
export type PersonalizationSettings = { usePurchaseHistory: boolean; useCurrentCart: boolean; updatedAt: string | null };
export type PurchaseItem = { productId: string; name: string; unitPrice: number; quantity: number };
export type PurchaseOrder = { id: string; orderedAt: string; total: number; dataOrigin: "operated" | "seeded" | "synthetic"; items: PurchaseItem[] };
export type AccountScope = { userId: string; visitId: string; storeId: string; asOf: string; cartVersion: number };
export type PurchaseHistory = { orders: PurchaseOrder[]; nextCursor: string | null };
export type SettingsResponse = { scope: AccountScope; settings: PersonalizationSettings };
export const accountMessages: Record<string, string> = {
  invalid_request: "設定の入力内容を確認してください。",
  settings_changed: "別の画面で設定が変更されました。最新の設定を確認して、もう一度操作してください。",
  input_changed: "買い物や設定が更新されました。最新の状態で再試行してください。",
  visit_unavailable: "店舗・来店を選び直してください。",
  forbidden: "このアカウントでは購入履歴・設定にアクセスできません。",
  database_not_ready: "購入履歴・設定の接続は準備中です。しばらくしてから再試行してください。",
  configuration_missing: "買い物機能の接続設定がまだありません。担当者へお問い合わせください。",
  configuration_invalid: "買い物機能の接続設定を確認する必要があります。",
  connection_failed: "通信できませんでした。通信状態を確認して再試行してください。",
};
