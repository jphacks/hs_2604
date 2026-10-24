"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { cartRequest, useCart } from "@/features/cart/cart-provider";
import { cartMessages, type ProductPage, type StoreProduct } from "@/features/cart/contracts";
import { BarcodeScanner } from "@/features/scanner/barcode-scanner";
import { SerendipityOffers } from "@/features/offers/serendipity-offers";
import { SuggestionCards } from "@/features/recommendations/suggestion-cards";
import { offerKindLabel } from "@/features/offers/contracts";
import { useShoppingSession } from "@/features/shopping/session-provider";
import { productIcon } from "@/lib/product-visuals";
import { PRODUCT_GENRES, productGenre, type ProductGenreId } from "@/lib/product-genres";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });
const button = "min-h-11 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40";

export default function Home() {
  const cart = useCart();
  const session = useShoppingSession();
  const [cartOpen, setCartOpen] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [genre, setGenre] = useState<ProductGenreId>("vegetable");
  const [searched, setSearched] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const catalogRequest = useRef<AbortController | null>(null);
  const search = useRef({ query: "" });
  const closeButton = useRef<HTMLButtonElement>(null);

  // The menu shows genres (#144), so the whole store list is read once (50 per page, at most 20 pages).
  const loadProducts = async (q: string) => {
    catalogRequest.current?.abort();
    const controller = new AbortController(); catalogRequest.current = controller;
    search.current = { query: q };
    setCatalogLoading(true); setCatalogError(""); setProducts([]);
    try {
      const all: StoreProduct[] = [];
      for (let page = 0; page < 20; page++) {
        const data: ProductPage = await cartRequest(`/api/cart?products=1&q=${encodeURIComponent(q)}&offset=${all.length}`, undefined, controller.signal);
        if (controller.signal.aborted) return;
        all.push(...data.products);
        if (!data.hasMore) break;
      }
      setProducts(all); setSearched(q);
    } catch (failure) {
      if (controller.signal.aborted) return;
      const code = (failure as { code?: string })?.code;
      if (code === "unauthenticated" || code === "session_expired") session.revalidate();
      else setCatalogError(cartMessages[code ?? ""] ?? "商品一覧を取得できませんでした。通信状態を確認して再試行してください。");
    } finally { if (!controller.signal.aborted) setCatalogLoading(false); }
  };
  useEffect(() => {
    const boot = window.setTimeout(() => { void loadProducts(""); }, 0);
    return () => { window.clearTimeout(boot); catalogRequest.current?.abort(); };
    // Identity and visit changes unmount the shopping page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Only vegetables / meat / fish are listed (#144); search also stays within these genres.
  const shown = products.filter(product => searched ? productGenre(product) !== null : productGenre(product) === genre);
  useEffect(() => {
    if (!cartOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCartOpen(false);
      if (event.key === "Tab") {
        const controls = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"] button:not(:disabled), [role="dialog"] a[href]'));
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.body.style.overflow = "hidden"; window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", close); previous?.focus(); };
  }, [cartOpen]);
  const submitCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (cart.canEdit && barcode.trim()) cart.scan(barcode.trim());
  };
  const status = <div className={`rounded-2xl border p-4 ${cart.error ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-100 bg-emerald-50 text-emerald-950"}`}>
    <p role={cart.error ? "alert" : "status"} className="text-sm font-semibold">{cart.message}</p>
    {cart.pending && <button type="button" disabled={cart.busy} onClick={cart.retry} className={`${button} mt-3`}>同じ操作を再試行</button>}
    {!cart.pending && cart.error && <button type="button" disabled={cart.busy} onClick={cart.reload} className={`${button} mt-3`}>かごを再読み込み</button>}
  </div>;

  return <main className="min-h-screen overflow-x-hidden bg-[#f4f7f5] pb-28 text-slate-950">
    <header className="sticky top-0 z-30 border-b border-emerald-100 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-4">
        <div><h1><Image src="/brand/light/logo-kago-app.png" alt="KAGO/App" width={2124} height={384} className="h-auto w-40" priority /></h1>
          <p className="mt-1 text-[11px] font-bold text-slate-500">ログイン中の利用者の買い物</p></div>
        <div className="flex gap-2"><Link href="/App/account" className="grid size-11 place-items-center rounded-full bg-emerald-50 font-bold text-emerald-800" aria-label="マイページを開く">人</Link>
          <button type="button" onClick={() => setCartOpen(true)} className="min-h-11 rounded-full bg-slate-950 px-4 text-sm font-bold text-white" aria-label={`買い物かごを開く、現在${cart.itemCount}点`}>かご {cart.itemCount}</button></div>
      </div>
    </header>
    <div className="mx-auto grid max-w-xl gap-7 px-4 py-5">
      <section aria-labelledby="scan-heading">
        <p className="text-xs font-black tracking-wider text-emerald-700">SCAN</p>
        <h2 id="scan-heading" className="mb-3 text-2xl font-black">商品をスキャン</h2>
        <BarcodeScanner onDetected={cart.scan} onReadFailure={cart.scanFailed} disabled={!cart.canEdit} />
        <form onSubmit={submitCode} className="mt-3 flex items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-1 text-sm font-bold">商品コードを入力<input value={barcode} onChange={e => setBarcode(e.target.value)} required maxLength={100} autoComplete="off" className="min-h-11 min-w-0 rounded-xl border border-slate-300 bg-white px-3 font-normal" placeholder="バーコードの数字など" /></label>
          <button className={button} disabled={!cart.canEdit || !barcode.trim()}>コードで追加</button>
        </form>
        <a href="#manual-products" className="mt-3 block py-2 text-sm font-bold text-emerald-800 underline">読み取れない・バーコードがない商品は一覧から選ぶ ↓</a>
      </section>
      {!cartOpen && status}
      <SuggestionCards />
      <SerendipityOffers />
      <section id="manual-products" className="scroll-mt-24" aria-labelledby="products-heading">
        <p className="text-xs font-black tracking-wider text-emerald-700">PRODUCT MENU</p>
        <h2 id="products-heading" className="text-2xl font-black">商品から選ぶ</h2>
        <p className="mt-1 text-sm text-slate-600">ジャンルを選ぶと、選択中の店舗で取り扱っている商品と価格が表示されます。</p>
        <form onSubmit={event => { event.preventDefault(); void loadProducts(query); }} className="my-4 flex gap-2">
          <input aria-label="商品名・商品コードで検索" value={query} onChange={e => setQuery(e.target.value)} maxLength={100} placeholder="商品名・商品コードで検索" className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm" />
          <button className={button} disabled={catalogLoading}>検索</button>
        </form>
        {!searched && <div role="group" aria-label="ジャンル" className="mb-4 grid grid-cols-3 gap-2">
          {PRODUCT_GENRES.map(g => <button key={g.id} type="button" aria-pressed={genre === g.id} onClick={() => setGenre(g.id)}
            className={`grid min-h-20 place-items-center rounded-2xl border-2 p-2 font-black ${genre === g.id ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-200 bg-white text-slate-800"}`}>
            <span aria-hidden="true" className="text-3xl">{g.icon}</span><span>{g.label}</span>
          </button>)}
        </div>}
        {searched && <div className="mb-3 flex items-center justify-between gap-2 text-sm"><p className="font-bold">「{searched}」の検索結果</p>
          <button type="button" className="min-h-11 px-2 font-bold text-emerald-800 underline" onClick={() => { setQuery(""); void loadProducts(""); }}>ジャンルに戻る</button></div>}
        {catalogError && <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><p>{catalogError}</p><button type="button" onClick={() => { void loadProducts(search.current.query); }} className={`${button} mt-3`}>商品一覧を再試行</button></div>}
        <div className="grid grid-cols-3 gap-2">
          {shown.map(product => <article key={product.productId} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <div className="grid h-14 place-items-center rounded-xl bg-emerald-50 text-3xl" aria-hidden="true">{productIcon(product)}</div>
            <h3 className="mt-2 min-h-10 break-words text-xs font-bold leading-snug">{product.name}</h3>
            <p className="mt-1 text-sm font-black text-emerald-800">{yen.format(product.price)}</p>
            <button type="button" className="mt-2 min-h-11 w-full rounded-xl bg-emerald-700 text-sm font-bold text-white disabled:opacity-40" disabled={!cart.canEdit} onClick={() => cart.addProduct(product)} aria-label={`${product.name}をかごに追加`}>追加</button>
          </article>)}
        </div>
        {catalogLoading && <p role="status" className="py-5 text-sm">商品を読み込んでいます…</p>}
        {!catalogLoading && !catalogError && shown.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">{searched ? "該当する商品がありません" : "このジャンルの商品はまだありません"}</p>}
      </section>
    </div>
    {cart.itemCount > 0 && <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <button type="button" onClick={() => setCartOpen(true)} className="mx-auto flex w-full max-w-xl items-center justify-between rounded-2xl bg-emerald-700 px-5 py-4 font-black text-white"><span>買い物かご・{cart.itemCount}点</span><span>{yen.format(cart.total)} ›</span></button>
    </div>}
    {cartOpen && <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" tabIndex={-1} className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setCartOpen(false)} aria-label="買い物かごを閉じる" />
      <section role="dialog" aria-modal="true" aria-labelledby="cart-heading" className="relative flex max-h-[90dvh] w-full max-w-xl flex-col rounded-t-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-5"><h2 id="cart-heading" className="text-2xl font-black">買い物かご</h2><button ref={closeButton} type="button" onClick={() => setCartOpen(false)} className="size-11 rounded-full bg-slate-100 text-xl" aria-label="閉じる">×</button></div>
        <div className="overflow-y-auto p-4">
          {status}
          {cart.lines.length === 0 ? <p className="py-14 text-center font-bold">かごは空です</p> : <ul className="divide-y divide-slate-100">
            {cart.lines.map(line => <li key={line.productId} className="py-4">
              <div className="flex justify-between gap-3"><div><h3 className="font-bold">{line.name}</h3><p className="mt-1 text-sm text-slate-500">{yen.format(line.price)} / 点</p>{!line.available && <p className="mt-1 text-sm font-bold text-red-700">取扱停止中・削除してください</p>}{!!line.discount && line.offerKind && <p className="mt-1 text-sm font-bold text-pink-700">{offerKindLabel[line.offerKind]} −{yen.format(line.discount)}</p>}</div><div className="text-right">{!!line.discount && <p className="text-xs text-slate-400 line-through">{yen.format(line.price * line.quantity)}</p>}<p className="font-bold">{yen.format(line.price * line.quantity - (line.discount ?? 0))}</p></div></div>
              <div className="mt-3 flex items-center justify-between gap-3"><button type="button" disabled={!cart.canEdit} onClick={() => cart.setQuantity(line.productId, 0)} className="min-h-11 px-2 text-sm text-red-700 underline disabled:opacity-40" aria-label={`${line.name}を削除`}>削除</button>
                <div className="flex items-center rounded-full border border-emerald-200 bg-emerald-50"><button type="button" disabled={!cart.canEdit || (!line.available && line.quantity > 1)} onClick={() => cart.setQuantity(line.productId, line.quantity - 1)} aria-label={`${line.name}を1点減らす`} className="size-11 text-xl disabled:opacity-40">−</button><span className="w-9 text-center font-bold" aria-label={`${line.name}の数量`}>{line.quantity}</span><button type="button" disabled={!cart.canEdit || !line.available || line.quantity >= 999} onClick={() => cart.setQuantity(line.productId, line.quantity + 1)} aria-label={`${line.name}を1点増やす`} className="size-11 text-xl disabled:opacity-40">＋</button></div>
              </div>
            </li>)}
          </ul>}
        </div>
        <div className="border-t border-slate-200 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{cart.discountTotal > 0 && <div className="mb-2 grid gap-1 text-sm"><p className="flex justify-between"><span>小計</span><span>{yen.format(cart.subtotal)}</span></p><p className="flex justify-between font-bold text-pink-700"><span>クーポン・セール割引</span><span>−{yen.format(cart.discountTotal)}</span></p></div>}<div className="flex justify-between text-lg font-black"><span>合計 {cart.itemCount}点</span><span>{yen.format(cart.total)}</span></div><button type="button" disabled={cart.busy} onClick={cart.reload} className="mt-3 min-h-11 w-full text-sm text-emerald-800 underline">かごを最新にする</button>
          {cart.canEdit&&cart.itemCount>0&&cart.lines.every(line=>line.available)?<Link href="/App/checkout" className="mt-2 block min-h-12 rounded-xl bg-emerald-700 px-4 py-3 text-center text-sm font-black text-white">疑似購入の確認へ</Link>:<button type="button" disabled className="mt-2 min-h-12 w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white opacity-40">疑似購入の確認へ</button>}
          <p className="mt-2 text-center text-xs text-slate-500">デモ用の疑似購入です。実際の支払いは発生しません。</p>
        </div>
      </section>
    </div>}
  </main>;
}
