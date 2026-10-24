"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { BarcodeScanner } from "@/features/scanner/barcode-scanner";
import { useCart } from "@/features/cart/cart-provider";
import { usePersonalization } from "@/features/recommendations/personalization-provider";
import { useStore } from "@/features/store/store-provider";
import {
  getPersonalizedReason,
  getPersonalizedRecommendationCodes,
  TEST_CUSTOMER,
} from "@/features/recommendations/customer";
import {
  MENU_ONLY_PRODUCTS,
  Product,
  SHOP_PRODUCT_LIST,
} from "@/lib/products";
import {
  MENU_PRODUCT_IMAGES,
  productIcon,
  RECOMMENDATION_IMAGES,
} from "@/lib/product-visuals";

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
});

const RECOMMENDATION_MAP: Record<string, string[]> = {
  "2900000000049": ["2900000000056", "2900000000063", "2900000000087"],
  "2900000000056": ["2900000000049", "2900000000063", "2900000000070"],
  "2900000000063": ["2900000000056", "2900000000049", "PLU-1001"],
  "2900000000087": ["2900000000070", "2900000000049", "2900000000056"],
  "2900000000094": ["PLU-2001", "2900000000018", "PLU-1001"],
  "2900000000100": ["PLU-1001", "PLU-1003", "2900000000049"],
  "2900000000117": ["2900000000018", "2900000000025", "2900000000032"],
  "2900000000124": ["2900000000032", "2900000000049", "2900000000070"],
  "PLU-1001": ["2900000000063", "2900000000100", "2900000000094"],
  "PLU-1002": ["2900000000070", "2900000000056", "2900000000032"],
  "PLU-1003": ["2900000000056", "2900000000063", "2900000000018"],
  "PLU-2001": ["2900000000018", "2900000000056", "PLU-2002"],
  "PLU-2002": ["2900000000018", "2900000000025", "PLU-1001"],
  "PLU-3001": ["2900000000032", "2900000000049", "2900000000070"],
};

const FALLBACK_RECOMMENDATIONS = [
  ...getPersonalizedRecommendationCodes(),
  "PLU-2001",
  "2900000000018",
];

const GENERAL_RECOMMENDATIONS = [
  "2900000000049",
  "2900000000056",
  "2900000000087",
  "PLU-2001",
  "2900000000018",
];

const PRODUCT_BY_CODE: Record<string, Product> = Object.fromEntries(
  SHOP_PRODUCT_LIST.map((product) => [product.code, product]),
);

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 4h2l1.7 10.2a2 2 0 0 0 2 1.7h7.9a2 2 0 0 0 1.9-1.4L21 7H6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="20" r="1.3" fill="currentColor" />
      <circle cx="17" cy="20" r="1.3" fill="currentColor" />
    </svg>
  );
}

export default function Home() {
  const { cart, lines, itemCount, total, addToCart: addCartItem, changeQuantity, clearCart } = useCart();
  const { settings } = usePersonalization();
  const { products: storeProducts } = useStore();
  const [notice, setNotice] = useState("バーコードを読み取って商品を追加できます");
  const [noticeTone, setNoticeTone] = useState<"info" | "success" | "error">("info");
  const [addedProduct, setAddedProduct] = useState<Product | null>(null);
  const [lastAddedCode, setLastAddedCode] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [category, setCategory] = useState("すべて");

  const categories = useMemo(
    () => ["すべて", ...Array.from(new Set(MENU_ONLY_PRODUCTS.map((product) => product.category)))],
    [],
  );

  const storeProductByCode = useMemo<Record<string, Product>>(
    () => Object.fromEntries(storeProducts.map((product) => [product.code, product])),
    [storeProducts],
  );

  const visibleProducts = useMemo(() => {
    return MENU_ONLY_PRODUCTS.filter((product) => {
      return category === "すべて" || product.category === category;
    });
  }, [category]);

  const recommendations = useMemo(() => {
    const personalizedFallback = settings.usePurchaseHistory
      ? FALLBACK_RECOMMENDATIONS
      : GENERAL_RECOMMENDATIONS;
    const preferred = lastAddedCode && settings.useCurrentCart
      ? RECOMMENDATION_MAP[lastAddedCode] ?? []
      : personalizedFallback;
    const candidates = [...preferred, ...personalizedFallback];
    return Array.from(new Set(candidates))
      .filter((code) => PRODUCT_BY_CODE[code] && !cart[code])
      .slice(0, 3)
      .map((code) => PRODUCT_BY_CODE[code]);
  }, [cart, lastAddedCode, settings.useCurrentCart, settings.usePurchaseHistory]);

  useEffect(() => {
    if (!cartOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCartOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [cartOpen]);

  useEffect(() => {
    if (!addedProduct) return;
    const timer = window.setTimeout(() => setAddedProduct(null), 2800);
    return () => window.clearTimeout(timer);
  }, [addedProduct]);

  const addToCart = (product: Product) => {
    addCartItem(product);
    setLastAddedCode(product.code);
    setNotice(`${product.name}をかごに追加しました`);
    setNoticeTone("success");
    setAddedProduct(product);
  };

  const handleCode = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;
    const product = storeProductByCode[code];
    if (product) {
      addToCart(product);
      return;
    }
    setNotice("このバーコードの商品は、まだ登録されていません");
    setNoticeTone("error");
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f4f7f5] pb-28 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-emerald-100/80 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-xl items-center justify-between px-4 pb-3.5 pt-[max(0.875rem,env(safe-area-inset-top))] sm:px-5">
          <div>
            <p className="text-[11px] font-black tracking-[0.2em] text-emerald-700">KAGO/OS</p>
            <h1><Image src="/brand/light/logo-kago-app.png" alt="KAGO/App" width={2124} height={384} className="h-auto w-44" priority /></h1>
            <p className="mt-0.5 text-[11px] font-bold text-slate-500">{TEST_CUSTOMER.profile.displayName}さんの買い物</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/App/account" className="grid size-12 place-items-center rounded-full border border-emerald-100 bg-emerald-50 text-sm font-black text-emerald-800 transition active:scale-95" aria-label="マイページを開く">
              美
            </Link>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative grid size-12 place-items-center rounded-full bg-slate-950 text-white shadow-lg shadow-slate-300 transition active:scale-95"
              aria-label={`買い物かごを開く、現在${itemCount}点`}
            >
              <span className="size-6"><CartIcon /></span>
              {itemCount > 0 && (
                <span className="absolute -right-1 -top-1 grid min-h-6 min-w-6 place-items-center rounded-full border-2 border-white bg-amber-400 px-1 text-[11px] font-black text-slate-950">
                  {itemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full min-w-0 max-w-xl gap-7 px-4 py-5">
        <section className="min-w-0" aria-labelledby="scan-heading">
          <div className="mb-3 flex items-end justify-between px-1">
            <div>
              <p className="text-xs font-black text-emerald-700">SCAN</p>
              <h2 id="scan-heading" className="text-2xl font-black tracking-[-0.04em]">商品をスキャン</h2>
            </div>
            <span className="hidden text-xs font-semibold text-slate-500 sm:inline">JAN / EAN対応</span>
          </div>
          <BarcodeScanner onDetected={handleCode} />
          <p className={`mt-3 rounded-2xl border px-4 py-3 text-sm font-bold ${noticeTone === "error" ? "border-red-200 bg-red-50 text-red-900" : noticeTone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-slate-200 bg-white text-slate-700"}`} aria-live="polite">
            <span className={`mr-2 ${noticeTone === "error" ? "text-red-500" : "text-emerald-600"}`}>●</span>{notice}
          </p>
          <a href="#manual-products" className="mt-3 flex min-h-12 items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-emerald-300 hover:text-emerald-800 active:scale-[0.99]">
            <span>バーコードがない商品はこちら</span><span aria-hidden="true">↓</span>
          </a>
        </section>

        <section className="min-w-0" aria-labelledby="recommend-heading">
          <div className="mb-3 flex items-end justify-between px-1">
            <div>
              <p className="text-xs font-black text-emerald-700">FOR YOU</p>
              <h2 id="recommend-heading" className="text-xl font-black tracking-[-0.03em]">
                {lastAddedCode && settings.useCurrentCart
                  ? "いまのかごにおすすめ"
                  : settings.usePurchaseHistory
                    ? `${TEST_CUSTOMER.profile.displayName.split(" ").at(-1)}さんへのおすすめ`
                    : "今日のおすすめ"}
              </h2>
            </div>
            <span className="hidden text-xs text-slate-500 sm:inline">おすすめの理由つき</span>
          </div>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0">
            {recommendations.map((product) => (
              <article key={product.code} className="group flex w-[9.75rem] shrink-0 snap-start flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:w-auto sm:min-w-0">
                <div className="relative grid aspect-square place-items-center overflow-hidden rounded-xl bg-emerald-50 text-4xl">
                  {RECOMMENDATION_IMAGES[product.code] ? (
                    <Image
                      src={RECOMMENDATION_IMAGES[product.code]}
                      alt={`${product.name}のおすすめ広告`}
                      fill
                      sizes="(max-width: 639px) 132px, 160px"
                      className="object-cover transition duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <span aria-hidden="true">{productIcon(product)}</span>
                  )}
                  <span className="absolute left-2 top-2 rounded-full bg-amber-300 px-2 py-1 text-[10px] font-black text-slate-950 shadow-sm">
                    本日の特選
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 min-h-10 text-sm font-bold leading-5">{product.name}</p>
                <p className="mt-1 text-xs font-black text-emerald-800">{yen.format(product.price)}</p>
                <p className="mt-2 text-[11px] font-semibold leading-4 text-slate-500">
                  {lastAddedCode && settings.useCurrentCart
                    ? "一緒に選ばれています"
                    : settings.usePurchaseHistory
                      ? getPersonalizedReason(product.code)
                      : "売れ筋の商品です"}
                </p>
                <button type="button" onClick={() => addToCart(product)} className="mt-3 rounded-xl bg-slate-950 px-2 py-2 text-xs font-black text-white transition active:scale-95">
                  かごに追加
                </button>
              </article>
            ))}
          </div>
        </section>

        <section id="manual-products" className="min-w-0 scroll-mt-24" aria-labelledby="menu-heading">
          <div className="mb-3 px-1">
            <p className="text-xs font-black text-emerald-700">PRODUCT MENU</p>
            <h2 id="menu-heading" className="text-2xl font-black tracking-[-0.04em]">商品から選ぶ</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">青果や惣菜など、バーコードを付けにくい商品を選べます</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <div className="flex gap-2 overflow-x-auto" aria-label="商品カテゴリー">
              {categories.map((item) => (
                <button key={item} type="button" onClick={() => setCategory(item)} aria-pressed={category === item} className={`min-h-11 shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition ${category === item ? "bg-emerald-700 text-white shadow-sm" : "bg-slate-100 text-slate-600"}`}>
                  {item}
                </button>
              ))}
            </div>
          </div>

          {visibleProducts.length > 0 ? (
            <div className="mt-3 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
              {visibleProducts.map((product) => (
                <article key={product.code} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-gradient-to-br from-emerald-50 to-amber-50">
                    <Image
                      src={MENU_PRODUCT_IMAGES[product.code]}
                      alt={product.name}
                      fill
                      sizes="(max-width: 359px) 100vw, 50vw"
                      className="object-contain p-3 transition duration-300 hover:scale-105"
                    />
                    <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-black text-emerald-800 shadow-sm">一覧で追加</span>
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-bold text-slate-500">{product.category}</p>
                    <h3 className="mt-1 line-clamp-2 min-h-11 text-sm font-black leading-5">{product.name}</h3>
                    <div className="mt-3 flex min-h-11 items-center justify-between gap-2">
                      <p className="font-black text-emerald-800">{yen.format(product.price)}</p>
                      {cart[product.code] ? (
                        <div className="flex items-center rounded-full border border-emerald-200 bg-emerald-50" aria-label={`${product.name}の数量`}>
                          <button type="button" aria-label={`${product.name}を1点減らす`} onClick={() => changeQuantity(product.code, -1)} className="grid size-10 place-items-center text-lg font-black text-emerald-900">−</button>
                          <span className="w-7 text-center text-sm font-black text-emerald-950">{cart[product.code].quantity}</span>
                          <button type="button" aria-label={`${product.name}を1点増やす`} onClick={() => addToCart(product)} className="grid size-10 place-items-center text-lg font-black text-emerald-900">＋</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => addToCart(product)} className="min-h-11 shrink-0 rounded-full bg-emerald-700 px-4 text-sm font-black text-white transition active:scale-95" aria-label={`${product.name}をかごに追加`}>
                          追加
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm font-semibold text-slate-500">該当する商品がありません</div>
          )}
        </section>
      </div>

      {itemCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
          <button type="button" onClick={() => setCartOpen(true)} className="mx-auto flex w-full max-w-xl items-center justify-between rounded-2xl bg-emerald-700 px-5 py-3.5 text-white shadow-lg shadow-emerald-900/20 transition active:scale-[0.99]">
            <span className="text-left"><span className="block text-xs font-bold text-emerald-100">買い物かご</span><span className="font-black">{itemCount}点</span></span>
            <span className="text-lg font-black">{yen.format(total)} <span className="ml-2">›</span></span>
          </button>
        </div>
      )}

      {addedProduct && !cartOpen && (
        <div className="pointer-events-none fixed inset-x-3 top-[max(5rem,calc(env(safe-area-inset-top)+4.5rem))] z-40 flex justify-center" aria-live="polite">
          <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-emerald-200 bg-white p-3 shadow-xl shadow-slate-900/15">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-100 font-black text-emerald-800" aria-hidden="true">✓</div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{addedProduct.name}</p><p className="text-xs font-semibold text-slate-500">かごに追加しました</p></div>
            <button type="button" onClick={() => { setAddedProduct(null); setCartOpen(true); }} className="min-h-10 shrink-0 rounded-xl bg-slate-950 px-3 text-xs font-black text-white">かごを見る</button>
          </div>
        </div>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button type="button" className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setCartOpen(false)} aria-label="買い物かごを閉じる" />
          <section role="dialog" aria-modal="true" aria-labelledby="cart-heading" className="relative flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl">
            <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-300" />
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div><p className="text-xs font-black text-emerald-700">YOUR CART</p><h2 id="cart-heading" className="text-2xl font-black tracking-[-0.04em]">買い物かご</h2></div>
              <button type="button" onClick={() => setCartOpen(false)} className="grid size-10 place-items-center rounded-full bg-slate-100 text-xl font-bold" aria-label="閉じる">×</button>
            </div>

            {lines.length === 0 ? (
              <div className="grid min-h-72 place-items-center px-6 text-center"><div><div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-700"><span className="size-7"><CartIcon /></span></div><p className="mt-4 font-black">かごは空です</p><p className="mt-1 text-sm text-slate-500">商品をスキャンするか、商品一覧から追加してください</p></div></div>
            ) : (
              <div className="overflow-y-auto px-5">
                {lines.map((line) => (
                  <article key={line.code} className="flex items-center gap-3 border-b border-slate-100 py-4">
                    <div className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-emerald-50 text-3xl">
                      {MENU_PRODUCT_IMAGES[line.code] ? <Image src={MENU_PRODUCT_IMAGES[line.code]} alt="" fill sizes="56px" className="object-contain p-1" /> : <span aria-hidden="true">{productIcon(line)}</span>}
                    </div>
                    <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-black">{line.name}</h3><p className="mt-1 font-black text-emerald-800">{yen.format(line.price)}</p></div>
                    <div className="flex items-center rounded-full border border-slate-200 bg-white">
                      <button type="button" aria-label={`${line.name}を1点減らす`} onClick={() => changeQuantity(line.code, -1)} className="grid size-9 place-items-center text-lg font-bold">−</button>
                      <span className="w-6 text-center text-sm font-black">{line.quantity}</span>
                      <button type="button" aria-label={`${line.name}を1点増やす`} onClick={() => changeQuantity(line.code, 1)} className="grid size-9 place-items-center text-lg font-bold">＋</button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div className="border-t border-slate-200 bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
              <div className="flex items-end justify-between"><div><p className="text-xs font-bold text-slate-500">合計（税込）</p><p className="text-sm font-semibold text-slate-500">{itemCount}点</p></div><p className="text-3xl font-black tracking-[-0.04em]">{yen.format(total)}</p></div>
              {lines.length > 0 && <button type="button" onClick={clearCart} className="mt-4 w-full rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600">かごを空にする</button>}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
