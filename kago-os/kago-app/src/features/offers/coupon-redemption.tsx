"use client";

import { useEffect, useRef, useState } from "react";
import { cartRequest } from "@/features/cart/cart-provider";
import { cartMessages, type StoreProduct } from "@/features/cart/contracts";
import { BarcodeScanner } from "@/features/scanner/barcode-scanner";
import type { SerendipityOffer } from "./contracts";

// Looking up a code records the scan, but never calls the cart's auto-add flow.
export function CouponRedemption({ offer, visitId, canEdit, onClaim }: {
  offer: SerendipityOffer; visitId: string; canEdit: boolean; onClaim: () => void;
}) {
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState<StoreProduct | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const intent = useRef<{ code: string; requestId: string } | null>(null);
  const locked = useRef(false);
  useEffect(() => () => { request.current?.abort(); }, []);

  const verify = async (value: string) => {
    const trimmed = value.trim();
    if (!canEdit || locked.current || !trimmed) return;
    locked.current = true; setBusy(true); setError(""); setVerified(null);
    const controller = new AbortController(); request.current = controller;
    // An interrupted lookup can be retried without recording another scan of the same code.
    if (intent.current?.code !== trimmed) intent.current = { code: trimmed, requestId: crypto.randomUUID() };
    try {
      const { product }: { product: StoreProduct } = await cartRequest("/api/cart", {
        action: "lookup", visitId, code: trimmed, requestId: intent.current.requestId,
      }, controller.signal);
      if (controller.signal.aborted) return;
      if (product.productId !== offer.product.productId) {
        setError("クーポン対象の商品ではありません。対象の商品を読み取るか、商品コードを確認してください。");
        return;
      }
      setVerified(product);
    } catch (failure) {
      const failureCode = (failure as { code?: string }).code;
      if (!controller.signal.aborted) setError(failureCode && failureCode !== "connection_failed" && cartMessages[failureCode]
        ? cartMessages[failureCode] : "商品を確認できませんでした。通信状態を確認して、もう一度お試しください。");
    } finally {
      locked.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return <div className="coupon-redemption">
    <p className="text-sm font-bold">対象の商品コード</p>
    <code className="mt-1 block select-all break-all rounded-xl bg-slate-100 px-3 py-2 text-lg font-bold">{offer.product.code}</code>
    <p className="my-3 text-xs leading-5 text-slate-600">商品のバーコードを読み取るか、商品コードを入力してください。確認だけではかごに追加されません。</p>
    {!verified ? <>
      <BarcodeScanner onDetected={value => { setCode(value); void verify(value); }} disabled={!canEdit || busy}
        appearance="shopping" description="対象商品のバーコードを読み取ってください。" />
      <form onSubmit={event => { event.preventDefault(); void verify(code); }} className="mt-3 grid gap-2">
        <label className="grid gap-1 text-sm font-bold">クーポン対象の商品コードを入力
          <input value={code} onChange={event => setCode(event.target.value)} required maxLength={100} autoComplete="off" disabled={busy}
            className="min-h-11 min-w-0 rounded-xl border border-slate-300 bg-white px-3 font-normal" placeholder="バーコードの数字など" />
        </label>
        <button type="submit" disabled={!canEdit || busy || !code.trim()} className="min-h-11 rounded-xl border border-pink-600 px-4 py-2 text-sm font-bold text-pink-700 disabled:opacity-40">{busy ? "商品を確認しています…" : "商品を確認"}</button>
      </form>
    </> : <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3" role="status">
      <p className="font-bold text-emerald-900">対象商品を確認しました：{verified.name}</p>
      <p className="mt-1 text-xs text-emerald-900">下のボタンで、読み取った1点にクーポンを使えます。</p>
      <button type="button" onClick={() => { setVerified(null); setError(""); }} className="mt-2 min-h-11 text-sm underline">別のコードを確認</button>
    </div>}
    {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <button type="button" disabled={!canEdit || busy || !verified} onClick={onClaim}
      className="mt-4 min-h-11 w-full rounded-xl bg-pink-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40">この商品にクーポンを使う</button>
  </div>;
}
