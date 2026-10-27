"use client";

import Image from "next/image";
import "@/components/app-brand-header.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { productGenre } from "@/lib/product-genres";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { cartRequest, useCart } from "@/features/cart/cart-provider";
import { cartMessages, type ProductPage, type StoreProduct } from "@/features/cart/contracts";
import { SuggestionDetail } from "@/features/recommendations/suggestion-detail";
import type { SavedSelectionItem } from "@/features/recommendations/selection-contracts";
import { useAppEvents } from "@/features/events/event-provider";
import { ProductScanDialog } from "@/features/scanner/product-scan-dialog";
import { BarcodeScanner } from "@/features/scanner/barcode-scanner";
import { SuggestionCards } from "@/features/recommendations/suggestion-cards";
import { offerKindLabel } from "@/features/offers/contracts";
import { useShoppingSession } from "@/features/shopping/session-provider";
import { productIcon, MENU_PRODUCT_IMAGES } from "@/lib/product-visuals";
import { ShoppingIcon } from "@/components/shopping-icons";
import { ProductComparison } from "@/features/comparison/product-comparison";
import { HomeCardStack } from "@/features/shopping/home-card-stack";
import "./shopping-home.css";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });
const button = "min-h-11 rounded-xl bg-[#019FA3] px-4 py-2 text-sm font-bold text-white disabled:opacity-40";

type Category = "all" | "fruit" | "deli" | "vegetables" | "bread" | "meat" | "fish";
const categories: {id:Exclude<Category,"all">;label:string;image:string}[] = [
  {id:"fruit",label:"果物",image:"/images/shopping/category-fruit.png"},
  {id:"deli",label:"惣菜",image:"/images/products/karaage.png"},
  {id:"vegetables",label:"野菜",image:"/images/shopping/category-vegetables.png"},
  {id:"bread",label:"パン",image:"/images/shopping/category-bread.png"},
  {id:"meat",label:"肉",image:"/images/products/karaage.png"},
  {id:"fish",label:"魚",image:"/images/shopping/category-vegetables.png"},
];
function inCategory(product:StoreProduct, category:Category){
  if(category==="meat"||category==="fish")return productGenre(product)===category;
  const fruit=/果物|フルーツ/.test(product.category) || (/青果|野菜/.test(product.category) && /りんご|リンゴ|バナナ|みかん|オレンジ|いちご|ぶどう|キウイ|梨|メロン|すいか|スイカ|もも|桃|柿|レモン/.test(product.name));
  if(category==="fruit")return fruit;
  if(category==="vegetables")return /青果|野菜/.test(product.category)&&!fruit;
  if(category==="deli")return /惣菜/.test(product.category);
  if(category==="bread")return /パン/.test(product.category);
  return true;
}

export default function Home() {
  const cart = useCart();
  const router=useRouter();
  const track=useAppEvents();
  const [homeDetail,setHomeDetail]=useState<{item:SavedSelectionItem;version:number}|null>(null);
  const [scanSelectionId,setScanSelectionId]=useState<string|null>(null);
  const session = useShoppingSession();
  const [scanProduct,setScanProduct]=useState<StoreProduct|null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [dismissedError,setDismissedError]=useState<string|null>(null);
  const [panel, setPanel] = useState<"products"|"recommendations"|"comparison"|null>(null);
  const [comparisonProducts,setComparisonProducts]=useState<StoreProduct[]>([]);
  const errorPopupOpen=!panel&&!cartOpen&&!!cart.error&&dismissedError!==cart.message;
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
    const boot = window.setTimeout(() => {
      const url=new URL(window.location.href);
      if(url.searchParams.get("cart")==="open"){
        setCartOpen(true);url.searchParams.delete("cart");window.history.replaceState(null,"",url);
      }
      void loadProducts("");
    }, 0);
    return () => { window.clearTimeout(boot); catalogRequest.current?.abort(); };
    // Identity and visit changes unmount the shopping page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!cartOpen && !panel && !errorPopupOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const close = (event: KeyboardEvent) => {
      const activeDialog = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"],[role="alertdialog"][aria-modal="true"]')).at(-1);
      if (event.key === "Escape" && activeDialog?.hasAttribute("data-home-dialog")) { setCartOpen(false); setPanel(null); setDismissedError(cart.message); }
      if (event.key === "Tab" && activeDialog?.hasAttribute("data-home-dialog")) {
        const controls = Array.from(activeDialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), summary'));
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.body.style.overflow = "hidden"; window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", close); previous?.focus(); };
  }, [cartOpen, panel, errorPopupOpen, cart.message]);
  const submitCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (cart.canEdit && barcode.trim()) cart.scan(barcode.trim());
  };
  const toggleComparison = (product: StoreProduct) => setComparisonProducts(previous =>
    previous.some(p=>p.productId===product.productId) ? previous.filter(p=>p.productId!==product.productId)
      : previous.length < 4 ? [...previous,product] : previous);
  const visibleProducts = products.filter(product => inCategory(product, category));
  const store = session.stores.find(s=>s.id===session.visit?.store_id);
  const storeName = [store?.name,store?.branch_name].filter(Boolean).join(" ");
  const status = <div className={`shopping-feedback ${cart.error ? "shopping-error border border-red-200 bg-red-50 text-red-900" : "border-emerald-100 bg-emerald-50 text-emerald-950"}`}>
    <p role={cart.error ? "alert" : "status"} className="text-sm font-semibold">{cart.message || "操作を完了できませんでした。もう一度お試しください。"}</p>
    {cart.pending && <button type="button" disabled={cart.busy} onClick={cart.retry} className={`${button} mt-3`}>同じ操作を再試行</button>}
    {!cart.pending && cart.error && <button type="button" disabled={cart.busy} onClick={cart.reload} className={`${button} mt-3`}>かごを再読み込み</button>}
  </div>;

  return <main id="shopping-top" className="shopping-home" data-testid="shopping-home">
    <header className="shopping-header app-brand-header" inert={cartOpen || panel!==null || errorPopupOpen}>
      <h1><Image src="/brand/light/logo-kago-app.png" alt="KAGO/App" width={2124} height={384} className="shopping-logo app-brand-logo" priority /></h1>
      <div className="shopping-store" aria-label={"ご利用店舗 "+storeName}><span>ご利用店舗</span><strong>{storeName}</strong></div>
    </header>
    <div className="shopping-content" inert={cartOpen || panel!==null || errorPopupOpen}>
      <section aria-label="商品をスキャン">
        <BarcodeScanner onDetected={code=>{setDismissedError(null);cart.scan(code);}} onReadFailure={reason=>{setDismissedError(null);cart.scanFailed(reason);}} disabled={!cart.canEdit} appearance="shopping" />
      </section>
      <form role="search" onSubmit={event => { event.preventDefault(); setCategory("all"); void loadProducts(query); setPanel("products"); }} className="shopping-search">
        <ShoppingIcon name="search" />
        <input aria-label="商品名・商品コードで検索" value={query} onChange={e => setQuery(e.target.value)} maxLength={100} placeholder="商品を検索" />
        <button type="submit" aria-label="検索" disabled={catalogLoading}><ShoppingIcon name="search" /></button>
      </form>
      <section aria-label="カテゴリーから探す" className="shopping-categories">
        {categories.slice(0,4).map(item => <button key={item.id} type="button" className="shopping-category" aria-label={item.label+"から探す"} onClick={() => {
          setCategory(item.id); setQuery(""); void loadProducts(""); setPanel("products");
        }}>
          <span className="shopping-category-photo"><Image src={item.image} alt="" fill sizes="100px" /></span><strong>{item.label}</strong><ShoppingIcon name="arrow" />
        </button>)}
      </section>
      <HomeCardStack onScan={product=>{setScanSelectionId(null);setScanProduct(product);}} onOpen={item=>{if(item)setHomeDetail({item,version:cart.version});else setPanel("recommendations");}} blocked={cartOpen||panel!==null||homeDetail?.version===cart.version}/>
    </div>
    {cart.itemCount > 0 && <div className="shopping-cart-summary" inert={cartOpen || panel!==null || errorPopupOpen}>
      <button type="button" onClick={() => setCartOpen(true)} aria-label={`買い物かごを開く、現在${cart.itemCount}点`}>
        <ShoppingIcon name="cart" /><span className="shopping-basket-label">買い物かご · {cart.itemCount}点</span>
        <span className="shopping-basket-price">{yen.format(cart.total)}</span><ShoppingIcon name="arrow" className="shopping-basket-chevron" />
      </button>
    </div>}
    <nav className="shopping-nav" aria-label="買い物ナビ" inert={cartOpen || panel!==null || errorPopupOpen}><div>
      <Link href="/App/history" aria-label="りれき"><span><ShoppingIcon name="history" /></span>りれき</Link>
      <Link href="/App" aria-current="page" aria-label="ホーム"><span><ShoppingIcon name="home" /></span>ホーム</Link>
      <Link href="/App/account" aria-label="マイページ"><span><ShoppingIcon name="user" /></span>マイページ</Link>
    </div></nav>
    <div className="sr-only" role="status" aria-live="polite">{cart.message}</div>
    {errorPopupOpen && <div className="shopping-error-toast">
      <button type="button" tabIndex={-1} aria-label="お知らせを閉じる" className="shopping-error-backdrop" onClick={()=>setDismissedError(cart.message)}/>
      <section role="alertdialog" aria-modal="true" aria-label="お買い物のお知らせ" data-home-dialog className="shopping-error-card">
        <button ref={closeButton} type="button" className="shopping-error-close" aria-label="閉じる" onClick={()=>setDismissedError(cart.message)}>×</button>
        {status}
        <button type="button" onClick={()=>{setDismissedError(cart.message);setPanel("products");}} className="shopping-error-alternative">商品コードを入力・商品を選ぶ</button>
      </section>
    </div>}
    {panel && <div className="shopping-sheet-overlay">
      <button type="button" tabIndex={-1} aria-label="画面を閉じる" onClick={()=>setPanel(null)} />
      <section role="dialog" aria-modal="true" aria-labelledby="shopping-panel-title" data-home-dialog className="shopping-sheet">
        <header className="shopping-sheet-header"><h2 id="shopping-panel-title">{panel==="products"?(category==="all"?"商品を探す":categories.find(c=>c.id===category)!.label+"から探す"):panel==="comparison"?"商品を比較":"おすすめ商品"}</h2><button ref={closeButton} type="button" aria-label="閉じる" onClick={()=>setPanel(null)}>×</button></header>
        <div className="shopping-sheet-scroll">
          {panel==="products"?<>
            <form role="search" onSubmit={event=>{event.preventDefault();setCategory("all");void loadProducts(query);}} className="shopping-search">
              <ShoppingIcon name="search"/><input aria-label="検索結果を絞り込む" value={query} onChange={e=>setQuery(e.target.value)} placeholder="商品を検索" maxLength={100}/><button type="submit" aria-label="商品一覧を検索" disabled={catalogLoading}><ShoppingIcon name="search"/></button>
            </form>
            <div className="shopping-catalog-tabs" aria-label="商品のカテゴリ">
              {[{id:"all" as Category,label:"すべて"},...categories].map(item=><button key={item.id} type="button" aria-pressed={category===item.id} onClick={()=>setCategory(item.id)}>{item.label}</button>)}
            </div>
            <div className="my-3 flex flex-wrap items-center gap-3 rounded-xl bg-teal-50 p-3">
              <p className="text-sm">比較する商品を2〜4点選べます（{comparisonProducts.length}/4点）。</p>
              <button type="button" className={button} disabled={comparisonProducts.length<2} onClick={()=>setPanel("comparison")}>選んだ商品を比較</button>
              {comparisonProducts.length>0&&<button type="button" className="min-h-11 px-3 text-sm underline" onClick={()=>setComparisonProducts([])}>比較の選択を解除</button>}
            </div>
            {/* #166：分類（果物・惣菜・野菜・パン）から開いたときは出さない。検索（すべての商品）では、カメラで読めないときの代わりとして残す */}
            {category==="all"&&<details className="shopping-code"><summary>バーコードが読み取れないとき</summary>
        <form onSubmit={submitCode} className="mt-3 flex items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-1 text-sm font-bold">商品コードを入力<input value={barcode} onChange={e => setBarcode(e.target.value)} required maxLength={100} autoComplete="off" className="min-h-11 min-w-0 rounded-xl border border-slate-300 bg-white px-3 font-normal" placeholder="バーコードの数字など" /></label>
          <button className={button} disabled={!cart.canEdit || !barcode.trim()}>コードで追加</button>
        </form>
            </details>}
            {cart.error&&<div className="mb-3">{status}</div>}
      <section id="manual-products" className="shopping-products" aria-labelledby="products-heading">
        <div className="shopping-catalog-heading"><h2 id="products-heading">{category==="all"?"すべての商品":categories.find(c=>c.id===category)!.label}</h2><span>{catalogLoading?"読み込み中":visibleProducts.length+"件"}</span></div>
        {catalogError && <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><p>{catalogError}</p><button type="button" onClick={() => { void loadProducts(search.current.query, search.current.offset); }} className={`${button} mt-3`}>商品一覧を再試行</button></div>}
        <div className="shopping-product-grid">
          {visibleProducts.map(product => <article key={product.productId} className="shopping-product rounded-2xl bg-white p-4">
            <div className="shopping-product-image" aria-hidden="true">{MENU_PRODUCT_IMAGES[product.code] ? <Image src={MENU_PRODUCT_IMAGES[product.code]} alt="" fill sizes="200px" /> : productIcon(product)}</div>
            <label className="mt-3 flex min-h-11 items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={comparisonProducts.some(p=>p.productId===product.productId)}
                disabled={comparisonProducts.length>=4&&!comparisonProducts.some(p=>p.productId===product.productId)}
                onChange={()=>toggleComparison(product)} aria-label={product.name+"を比較に選ぶ"} />比較に選ぶ
            </label>
            <p className="mt-3 text-xs text-slate-500">{product.category}</p><h3 className="mt-1 min-h-10 text-sm font-bold">{product.name}</h3>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="shopping-product-price">{yen.format(product.price)}</p>
              <button type="button" className="shopping-product-add" disabled={!cart.canEdit} onClick={() => {setScanSelectionId(null);setScanProduct(product);}} aria-label={`${product.name}をスキャンして追加`}><span aria-hidden="true">＋</span> スキャンして追加</button></div>
          </article>)}
        </div>
        {catalogLoading && <p role="status" className="py-5 text-sm">商品を読み込んでいます…</p>}
        {!catalogLoading && !catalogError && visibleProducts.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">該当する商品がありません</p>}
        {hasMore && !catalogError && <button type="button" className={`${button} mt-4 w-full`} disabled={catalogLoading} onClick={() => { void loadProducts(search.current.query, products.length); }}>さらに表示</button>}
      </section>
          </>:panel==="comparison"?<ProductComparison products={comparisonProducts} onBack={()=>setPanel("products")}
            disabled={!cart.canEdit} onScan={product=>{setScanSelectionId(null);setScanProduct(product);}}/>:<div className="space-y-5"><SuggestionCards/></div>}
        </div>
        {panel==="products"&&cart.itemCount>0&&<div className="shopping-sheet-cart"><button type="button" onClick={()=>{setPanel(null);setCartOpen(true);}} aria-label={`買い物かごを開く、現在${cart.itemCount}点`}>買い物かご · {cart.itemCount}点　{yen.format(cart.total)}</button></div>}
      </section>
    </div>}
    {cartOpen && <div className="shopping-basket-overlay">
      <button type="button" tabIndex={-1} className="shopping-basket-backdrop" onClick={() => setCartOpen(false)} aria-label="買い物かごを閉じる" />
      <section role="dialog" aria-modal="true" aria-labelledby="cart-heading" data-home-dialog className="shopping-basket-sheet">
        <div className="shopping-basket-handle" aria-hidden="true"/>
        <header className="shopping-basket-header"><h2 id="cart-heading">買い物かご</h2><span>{cart.itemCount}点</span><button ref={closeButton} type="button" onClick={() => setCartOpen(false)} aria-label="閉じる">×</button></header>
        <div className="shopping-basket-body">
          <div className="shopping-coupon-notice"><span className="shopping-coupon-symbol"><ShoppingIcon name="coupon"/></span><div>
            <strong>{cart.discountTotal>0?"クーポンが適用されました":"クーポンでもっとお得に"}</strong>
            <p>{cart.discountTotal>0?yen.format(cart.discountTotal)+" OFF":"商品を追加すると、おすすめが届きます"}</p>
          </div></div>
          {cart.error&&<div className="mb-3">{status}</div>}
          {cart.lines.length === 0 ? <p className="shopping-basket-empty">かごは空です</p> : <ul className="shopping-basket-lines">
            {cart.lines.map(line => {
              const photo=MENU_PRODUCT_IMAGES[line.code] ?? (/パン/.test(line.category)?"/images/shopping/category-bread.png":/青果|果物/.test(line.category)?"/images/shopping/category-fruit.png":/惣菜/.test(line.category)?"/images/products/karaage.png":undefined);
              return <li key={line.productId} className="shopping-basket-line">
                <div className="shopping-basket-photo" aria-hidden="true">{photo?<Image src={photo} alt="" fill sizes="80px"/>:productIcon(line)}</div>
                <div className="shopping-basket-product"><h3>{line.name}</h3><p>{yen.format(line.price*line.quantity-(line.discount??0))}</p>
                  {!line.available&&<span className="shopping-basket-warning">取扱停止中</span>}
                  {!!line.discount&&line.offerKind&&<span className="shopping-basket-discount">{offerKindLabel[line.offerKind]}</span>}
                </div>
                <div className="shopping-basket-quantity"><button type="button" disabled={!cart.canEdit||(!line.available&&line.quantity>1)} onClick={()=>cart.setQuantity(line.productId,line.quantity-1)} aria-label={line.name+"を1点減らす"}>−</button><span aria-label={line.name+"の数量"}>{line.quantity}</span><button type="button" disabled={!cart.canEdit||!line.available||line.quantity>=999} onClick={()=>{setScanSelectionId(null);setScanProduct(line);}} aria-label={line.name+"を1点増やす"}>＋</button></div>
                <button type="button" className="shopping-basket-delete" disabled={!cart.canEdit} onClick={()=>cart.setQuantity(line.productId,0)} aria-label={line.name+"を削除"}><ShoppingIcon name="trash"/></button>
              </li>;
            })}
          </ul>}
        </div>
        <footer className="shopping-basket-footer">
          {cart.discountTotal>0&&<p className="shopping-basket-saving"><span>クーポン・セール割引</span><span>−{yen.format(cart.discountTotal)}</span></p>}
          <div className="shopping-basket-total"><span>合計</span><strong>{yen.format(cart.total)}</strong></div>
          <button type="button" onClick={()=>{router.push("/App/checkout");}} className="shopping-checkout-button" disabled={cart.lines.length===0||cart.busy||cart.pending} aria-describedby="shopping-checkout-note">レジに進む</button>
          <span id="shopping-checkout-note" className="sr-only">{cart.pending?"かごの保存結果を確認してからレジに進んでください。":"商品と合計を確認してから確定します。"}</span>
        </footer>
      </section>
    </div>}
    {homeDetail&&homeDetail.version===cart.version&&<SuggestionDetail scanRequired item={homeDetail.item} label={homeDetail.item.placementType==="sponsored"?"広告":homeDetail.item.placementType==="store_promo"?"店舗からのおすすめ":"あなたへのおすすめ"} added={cart.lines.some(line=>line.productId===homeDetail.item.product.productId)} disabled={!cart.canEdit} onClose={()=>setHomeDetail(null)} onAdd={()=>{setScanSelectionId(homeDetail.item.selectionItemId);setScanProduct({...homeDetail.item.product,available:true});}}/>}
    {scanProduct&&<ProductScanDialog product={scanProduct} disabled={!cart.canEdit} onClose={()=>setScanProduct(null)} onVerified={()=>{if(scanSelectionId){track({event_type:"recommendation_click",selection_item_id:scanSelectionId,product_id:scanProduct.productId,payload:{target:"add_button"}});cart.addRecommendation(scanProduct.productId,scanSelectionId);}else cart.setQuantity(scanProduct.productId,(cart.lines.find(line=>line.productId===scanProduct.productId)?.quantity??0)+1);setHomeDetail(null);}}/>}
  </main>;
}
