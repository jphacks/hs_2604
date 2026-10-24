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
import { productIcon, MENU_PRODUCT_IMAGES } from "@/lib/product-visuals";
import { ShoppingIcon } from "@/components/shopping-icons";
import "./shopping-home.css";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });
const button = "min-h-11 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40";

type Category = "all" | "fruit" | "deli" | "vegetables" | "bread";
const categories: {id:Exclude<Category,"all">;label:string;image:string}[] = [
  {id:"fruit",label:"果物",image:"/images/products/apple.png"},
  {id:"deli",label:"惣菜",image:"/images/products/karaage.png"},
  {id:"vegetables",label:"野菜",image:"/images/products/onion.png"},
  {id:"bread",label:"パン",image:"/images/products/shio-pan.png"},
];
function inCategory(product:StoreProduct, category:Category){
  const fruit=/果物|フルーツ|りんご|リンゴ|バナナ|みかん|オレンジ|いちご|ぶどう|キウイ|梨/.test(product.name+" "+product.category);
  if(category==="fruit")return fruit;
  if(category==="vegetables")return /青果|野菜/.test(product.category)&&!fruit;
  if(category==="deli")return /惣菜/.test(product.category);
  if(category==="bread")return /パン/.test(product.category);
  return true;
}

export default function Home() {
  const cart = useCart();
  const session = useShoppingSession();
  const [cartOpen, setCartOpen] = useState(false);
  const [category, setCategory] = useState<Category>("all");
  const [barcode, setBarcode] = useState("");
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const catalogRequest = useRef<AbortController | null>(null);
  const search = useRef({ query: "", offset: 0 });
  const closeButton = useRef<HTMLButtonElement>(null);

  const loadProducts = async (q: string, offset = 0) => {
    catalogRequest.current?.abort();
    const controller = new AbortController(); catalogRequest.current = controller;
    search.current = { query: q, offset };
    setCatalogLoading(true); setCatalogError("");
    if (offset === 0) setProducts([]);
    try {
      const data: ProductPage = await cartRequest(`/api/cart?products=1&q=${encodeURIComponent(q)}&offset=${offset}`, undefined, controller.signal);
      if (controller.signal.aborted) return;
      setProducts(previous => offset ? [...previous, ...data.products] : data.products); setHasMore(data.hasMore);
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
  const visibleProducts = products.filter(product => inCategory(product, category));
  const status = <div className={`shopping-feedback ${cart.error ? "shopping-error border border-red-200 bg-red-50 text-red-900" : "border-emerald-100 bg-emerald-50 text-emerald-950"}`}>
    <p role={cart.error ? "alert" : "status"} className="text-sm font-semibold">{cart.message}</p>
    {cart.pending && <button type="button" disabled={cart.busy} onClick={cart.retry} className={`${button} mt-3`}>同じ操作を再試行</button>}
    {!cart.pending && cart.error && <button type="button" disabled={cart.busy} onClick={cart.reload} className={`${button} mt-3`}>かごを再読み込み</button>}
  </div>;

  return <main id="shopping-top" className="shopping-home min-h-screen overflow-x-hidden">
    <header className="shopping-header">
      <h1><Image src="/brand/light/logo-kago-app.png" alt="KAGO/App" width={2124} height={384} className="shopping-logo" priority /></h1>
      <button type="button" onClick={() => setCartOpen(true)} className="shopping-cart" aria-label={`買い物かごを開く、現在${cart.itemCount}点`}>
        <ShoppingIcon name="cart" /><span className="shopping-cart-count" aria-hidden="true">{cart.itemCount}</span>
      </button>
    </header>
    <div className="shopping-content">
      <section aria-labelledby="scan-heading">
        <h2 id="scan-heading" className="sr-only">商品をスキャン</h2>
        <BarcodeScanner onDetected={cart.scan} onReadFailure={cart.scanFailed} disabled={!cart.canEdit} appearance="shopping" />
      </section>
      <form role="search" onSubmit={event => { event.preventDefault(); setCategory("all"); void loadProducts(query); document.getElementById("manual-products")?.scrollIntoView(); }} className="shopping-search">
        <ShoppingIcon name="search" />
        <input aria-label="商品名・商品コードで検索" value={query} onChange={e => setQuery(e.target.value)} maxLength={100} placeholder="商品を検索" />
        <button type="submit" aria-label="検索" disabled={catalogLoading}><ShoppingIcon name="arrow" /></button>
      </form>
      <section aria-label="カテゴリーから探す" className="shopping-categories">
        {categories.map(item => <button key={item.id} type="button" className="shopping-category" aria-label={item.label+"から探す"} aria-pressed={category===item.id} onClick={() => {
          setCategory(item.id); setQuery(""); void loadProducts(""); document.getElementById("manual-products")?.scrollIntoView();
        }}>
          <span className="shopping-category-photo"><Image src={item.image} alt="" fill sizes="80px" /></span><strong>{item.label}</strong><ShoppingIcon name="arrow" />
        </button>)}
      </section>
      <section className="shopping-fresh" aria-label="新鮮な食材のおすすめ">
        <Image src="/images/shopping/fresh-family.png" alt="" fill sizes="(max-width: 520px) 100vw, 520px" />
        <div className="shopping-fresh-copy"><p>毎日の食卓を、もっとかんたんに</p>
          <h2><em>新鮮</em>な食材で<br/>家族の笑顔を。</h2>
          <a href="#shopping-recommendations">おすすめ商品を見る<ShoppingIcon name="arrow" /></a>
        </div>
      </section>
      <div className="shopping-code">
        <form onSubmit={submitCode} className="mt-3 flex items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-1 text-sm font-bold">商品コードを入力<input value={barcode} onChange={e => setBarcode(e.target.value)} required maxLength={100} autoComplete="off" className="min-h-11 min-w-0 rounded-xl border border-slate-300 bg-white px-3 font-normal" placeholder="バーコードの数字など" /></label>
          <button className={button} disabled={!cart.canEdit || !barcode.trim()}>コードで追加</button>
        </form>
        <a href="#manual-products" className="mt-2 block py-2 text-xs font-bold text-teal-700 underline">読み取れない・バーコードがない商品は一覧から選ぶ ↓</a>
      </div>
      {!cartOpen && status}
      <div id="shopping-recommendations" className="space-y-5 scroll-mt-5"><SuggestionCards /><SerendipityOffers /></div>
      <section id="manual-products" className="shopping-products" aria-labelledby="products-heading">
        <p className="text-xs font-black tracking-wider text-emerald-700">PRODUCT MENU</p>
        <h2 id="products-heading" className="text-2xl font-black">商品から選ぶ</h2>
        <p className="mt-1 text-sm text-slate-600">選択中の店舗で取り扱っている商品と価格です。</p>

        <button type="button" onClick={() => { setCategory("all"); setQuery(""); void loadProducts(""); }} className="my-3 min-h-11 rounded-full bg-white px-4 text-sm font-bold text-teal-800" aria-pressed={category==="all"}>すべての商品</button>
        {catalogError && <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><p>{catalogError}</p><button type="button" onClick={() => { void loadProducts(search.current.query, search.current.offset); }} className={`${button} mt-3`}>商品一覧を再試行</button></div>}
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
          {visibleProducts.map(product => <article key={product.productId} className="shopping-product rounded-2xl bg-white p-4">
            <div className="shopping-product-image" aria-hidden="true">{MENU_PRODUCT_IMAGES[product.code] ? <Image src={MENU_PRODUCT_IMAGES[product.code]} alt="" fill sizes="200px" /> : productIcon(product)}</div>
            <p className="mt-3 text-xs text-slate-500">{product.category}</p><h3 className="mt-1 min-h-10 text-sm font-bold">{product.name}</h3>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="font-black text-emerald-800">{yen.format(product.price)}</p>
              <button type="button" className={button} disabled={!cart.canEdit} onClick={() => cart.addProduct(product)} aria-label={`${product.name}をかごに追加`}>追加</button></div>
          </article>)}
        </div>
        {catalogLoading && <p role="status" className="py-5 text-sm">商品を読み込んでいます…</p>}
        {!catalogLoading && !catalogError && visibleProducts.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">該当する商品がありません</p>}
        {hasMore && !catalogError && <button type="button" className={`${button} mt-4 w-full`} disabled={catalogLoading} onClick={() => { void loadProducts(search.current.query, products.length); }}>さらに表示</button>}
      </section>
    </div>
    <nav className="shopping-nav" aria-label="買い物ナビ"><div>
      <Link href="/App/account#history-heading" aria-label="りれき"><span><ShoppingIcon name="history" /></span>りれき</Link>
      <Link href="/App" aria-current="page" aria-label="ホーム"><span><ShoppingIcon name="home" /></span>ホーム</Link>
      <Link href="/App/account" aria-label="マイページ"><span><ShoppingIcon name="user" /></span>マイページ</Link>
    </div></nav>
    {cart.itemCount > 0 && <div className="shopping-cart-summary fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
        <div className="border-t border-slate-200 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{cart.discountTotal > 0 && <div className="mb-2 grid gap-1 text-sm"><p className="flex justify-between"><span>小計</span><span>{yen.format(cart.subtotal)}</span></p><p className="flex justify-between font-bold text-pink-700"><span>クーポン・セール割引</span><span>−{yen.format(cart.discountTotal)}</span></p></div>}<div className="flex justify-between text-lg font-black"><span>合計 {cart.itemCount}点</span><span>{yen.format(cart.total)}</span></div><button type="button" disabled={cart.busy} onClick={cart.reload} className="mt-3 min-h-11 w-full text-sm text-emerald-800 underline">かごを最新にする</button><p className="mt-1 text-center text-xs text-slate-500">購入手続きは準備中です</p></div>
      </section>
    </div>}
  </main>;
}
