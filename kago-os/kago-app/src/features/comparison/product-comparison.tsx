"use client";

import { useEffect, useRef } from "react";
import type { StoreProduct } from "@/features/cart/contracts";
import { useAppEvents } from "@/features/events/event-provider";

export function ProductComparison({ products, onBack, onScan, disabled }: {
  products: StoreProduct[]; onBack: () => void; onScan: (product: StoreProduct) => void; disabled: boolean;
}) {
  const track = useAppEvents();
  const recorded = useRef(false);
  useEffect(() => {
    const record = () => {
      if (recorded.current || document.hidden || products.length < 2) return;
      recorded.current = true;
      track({ event_type: "product_compared", selection_item_id: null, product_id: null,
        payload: { product_ids: products.map(product => product.productId) } });
    };
    record();
    document.addEventListener("visibilitychange", record);
    return () => document.removeEventListener("visibilitychange", record);
  }, [products, track]);
  return <section aria-label="選んだ商品の比較" className="space-y-4">
    <p className="text-sm text-slate-600">この店舗の商品を並べています。比較せずにお買い物を続けることもできます。</p>
    <p className="text-xs text-slate-500">表は横にスクロールできます。価格は税込の表示価格です。割引の適用はかごで確認できます。</p>
    <div className="overflow-x-auto rounded-xl border border-slate-200" tabIndex={0} aria-label="商品比較表を横にスクロール">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">選んだ商品の名前・価格・カテゴリ・商品コード</caption>
        <thead><tr><th scope="col" className="min-w-24 p-3">比較項目</th>{products.map(p =>
          <th key={p.productId} scope="col" className="min-w-44 p-3">{p.name}</th>)}</tr></thead>
        <tbody>
          <tr><th scope="row" className="p-3">価格（税込）</th>{products.map(p=><td key={p.productId} className="p-3 font-bold">{p.price.toLocaleString("ja-JP")}円</td>)}</tr>
          <tr><th scope="row" className="p-3">カテゴリ</th>{products.map(p=><td key={p.productId} className="p-3">{p.category}</td>)}</tr>
          <tr><th scope="row" className="p-3">商品コード</th>{products.map(p=><td key={p.productId} className="p-3">{p.code}</td>)}</tr>
          <tr><th scope="row" className="p-3">かごに追加</th>{products.map(p=><td key={p.productId} className="p-3"><button type="button"
            className="min-h-11 rounded-xl bg-[#019FA3] px-3 py-2 font-bold text-white disabled:opacity-40"
            disabled={disabled || !p.available} onClick={()=>onScan(p)} aria-label={p.name+"をスキャンして追加"}>スキャンして追加</button></td>)}</tr>
        </tbody>
      </table>
    </div>
    <button type="button" onClick={onBack} className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold">商品選択に戻る</button>
  </section>;
}
