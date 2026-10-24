import type { CartLine } from "../cart/contracts";

export type CheckoutIntent = { userId: string; visitId: string; requestId: string; expectedVersion: number; expectedTotal: number };
export type CheckoutQuote = { userId: string; visitId: string; storeId: string; storeName: string; cartVersion: number;
  lines: CartLine[]; subtotal: number; discountTotal: number; total: number; canCheckout: boolean };
export type CheckoutReceipt = { orderId: string; visitId: string; storeId: string; storeName: string; orderedAt: string;
  subtotal: number; discountTotal: number; total: number; dataOrigin: "operated" | "seeded" | "synthetic";
  lines: { productId: string; name: string; unitPrice: number; quantity: number; discount: number }[] };
export type CheckoutContext = { userId: string } & (
  | { state: "no_visit" }
  | { state: "review"; quote: CheckoutQuote }
  | { state: "complete"; receipt: CheckoutReceipt; replayed?: boolean }
);
const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function isCheckoutIntent(value: unknown): value is CheckoutIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return uuid(row.userId) && uuid(row.visitId) && uuid(row.requestId)
    && Number.isSafeInteger(row.expectedVersion) && (row.expectedVersion as number) >= 0 && (row.expectedVersion as number) <= 2147483647
    && Number.isSafeInteger(row.expectedTotal) && (row.expectedTotal as number) >= 0 && (row.expectedTotal as number) <= 2147483647;
}
export const checkoutMessages: Record<string, string> = {
  price_changed: "価格や割引が変わりました。最新の明細と合計を確認して、もう一度確定してください。",
  cart_changed: "かごが変更されました。最新の内容を確認して、もう一度確定してください。",
  checkout_unavailable: "現在のかごでは購入を確定できません。空のかごや取扱停止の商品がないか確認してください。",
  checkout_conflict: "この来店の購入結果を確認してください。同じ来店で注文を重ねて作成することはできません。",
  invalid_request: "購入内容を確認できません。画面を読み直してください。",
  forbidden: "この購入内容にはアクセスできません。利用者と来店を確認してください。",
  connection_failed: "購入結果を確認できませんでした。同じ購入操作を再試行するか、購入結果を確認してください。",
  storage_unavailable: "購入操作を安全に保存できません。ブラウザのストレージ設定を確認して再試行してください。",
  unauthenticated: "ログインが必要です。買い物画面からログインし直してください。",
  session_expired: "認証の有効期限が切れました。買い物画面からログインし直してください。",
};
