"use client";

import Link from "next/link";
import { UtilityShell } from "@/components/utility-shell";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";

import { StoreProfile, useStore } from "@/features/store/store-provider";
import { Product } from "@/lib/products";
import { productIcon } from "@/lib/product-visuals";

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
});

const EMPTY_PROFILE: StoreProfile = {
  name: "",
  branchName: "",
  storeCode: "",
  industry: "スーパーマーケット",
  address: "",
  businessHours: "",
};

const EMPTY_PRODUCT: Product = {
  code: "",
  name: "",
  price: 0,
  category: "",
};

const fieldClassName = "mt-1.5 min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100";

function parseCsvRow(row: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];
    if (character === '"' && quoted && row[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function parseProductCsv(csv: string): Product[] {
  const rows = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((row) => row.trim());
  if (rows.length < 2) throw new Error("商品データがありません");
  const headers = parseCsvRow(rows[0]);
  const requiredHeaders = ["code", "name", "price", "category"];
  if (!requiredHeaders.every((header) => headers.includes(header))) {
    throw new Error("見出しは code,name,price,category の順で用意してください");
  }
  const positions = Object.fromEntries(headers.map((header, index) => [header, index]));
  const products = rows.slice(1).map((row, rowIndex) => {
    const cells = parseCsvRow(row);
    const price = Number(cells[positions.price]);
    const product: Product = {
      code: cells[positions.code]?.trim(),
      name: cells[positions.name]?.trim(),
      price,
      category: cells[positions.category]?.trim(),
    };
    if (!product.code || !product.name || !product.category || !Number.isInteger(price) || price < 0) {
      throw new Error(`${rowIndex + 2}行目の内容を確認してください`);
    }
    return product;
  });
  if (new Set(products.map((product) => product.code)).size !== products.length) {
    throw new Error("商品コードが重複しています");
  }
  return products;
}

function StoreProfileForm({
  initialProfile,
  onSave,
}: {
  initialProfile: StoreProfile | null;
  onSave: (profile: StoreProfile) => void;
}) {
  const [form, setForm] = useState(initialProfile ?? EMPTY_PROFILE);
  const [saved, setSaved] = useState(false);

  const update = (key: keyof StoreProfile, value: string) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(form);
    setSaved(true);
  };

  return (
    <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-black">店舗名<span className="ml-1 text-red-500">*</span><input required value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="例：KAGOマート" className={fieldClassName} /></label>
        <label className="text-sm font-black">支店名<input value={form.branchName} onChange={(event) => update("branchName", event.target.value)} placeholder="例：広島店" className={fieldClassName} /></label>
        <label className="text-sm font-black">店舗コード<span className="ml-1 text-red-500">*</span><input required value={form.storeCode} onChange={(event) => update("storeCode", event.target.value)} placeholder="例：HRS-001" className={fieldClassName} /></label>
        <label className="text-sm font-black">業態<select value={form.industry} onChange={(event) => update("industry", event.target.value)} className={fieldClassName}><option>スーパーマーケット</option><option>ドラッグストア</option><option>コンビニエンスストア</option><option>その他</option></select></label>
        <label className="text-sm font-black sm:col-span-2">所在地<input value={form.address} onChange={(event) => update("address", event.target.value)} placeholder="例：広島県広島市中区" className={fieldClassName} /></label>
        <label className="text-sm font-black sm:col-span-2">営業時間<input value={form.businessHours} onChange={(event) => update("businessHours", event.target.value)} placeholder="例：9:00〜22:00" className={fieldClassName} /></label>
      </div>
      <button type="submit" className="mt-5 min-h-12 w-full rounded-2xl bg-slate-950 px-4 font-black text-white transition active:scale-[0.99]">{saved ? "店舗情報を保存しました ✓" : "店舗情報を保存"}</button>
    </form>
  );
}

export default function StorePage() {
  const { profile, products, saveProfile, replaceProducts, addProduct, removeProduct } = useStore();
  const [productForm, setProductForm] = useState<Product>(EMPTY_PRODUCT);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const categories = useMemo(() => new Set(products.map((product) => product.category)).size, [products]);

  const importCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportMessage("");
    setImportError("");
    try {
      const importedProducts = parseProductCsv(await file.text());
      replaceProducts(importedProducts);
      setImportMessage(`${importedProducts.length}件の商品を登録しました`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "CSVを読み込めませんでした");
    } finally {
      event.target.value = "";
    }
  };

  const submitProduct = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addProduct({ ...productForm, price: Number(productForm.price) });
    setProductForm(EMPTY_PRODUCT);
    setImportError("");
    setImportMessage("商品を1件追加しました");
  };

  return (
    <UtilityShell kind="store"><main className="min-h-screen bg-[#f4f7f5] pb-16 text-slate-950">
      <header className="utility-toolbar">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pb-3.5 pt-[max(0.875rem,env(safe-area-inset-top))] sm:px-6">
          <div><h1 className="text-xl font-black">店舗・商品管理</h1></div>
          <Link href="/App" className="rounded-full bg-slate-950 px-4 py-2.5 text-xs font-black text-white">買い物画面を見る</Link>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-6 sm:px-6">
        <section className="utility-hero rounded-3xl bg-gradient-to-br from-emerald-800 to-emerald-600 p-6 text-white shadow-lg">
          <p className="text-xs font-black tracking-[0.15em] text-emerald-200">STORE SETUP</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.05em]">売り場をKAGO/OSにつなぐ</h2>
          <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-emerald-50">店舗情報と商品マスタを登録すると、KAGO/Appのスキャン、レコメンド、購入分析に同じデータを利用できます。</p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-black"><span className={`rounded-full px-3 py-2 ${profile ? "bg-white text-emerald-800" : "bg-emerald-950/30 text-emerald-100"}`}>1 店舗情報 {profile ? "✓" : "未登録"}</span><span className="rounded-full bg-white px-3 py-2 text-emerald-800">2 商品 {products.length}件 ✓</span></div>
        </section>

        <section aria-labelledby="store-profile-heading">
          <div className="mb-3 px-1"><p className="text-xs font-black text-emerald-700">STEP 1</p><h2 id="store-profile-heading" className="text-2xl font-black tracking-[-0.04em]">店舗情報</h2><p className="mt-1 text-sm font-semibold text-slate-500">サイネージや分析画面を店舗単位で管理するための基本情報です。</p></div>
          <StoreProfileForm key={profile ? `${profile.storeCode}-${profile.name}` : "empty"} initialProfile={profile} onSave={saveProfile} />
        </section>

        <section aria-labelledby="product-master-heading">
          <div className="mb-3 flex items-end justify-between px-1"><div><p className="text-xs font-black text-emerald-700">STEP 2</p><h2 id="product-master-heading" className="text-2xl font-black tracking-[-0.04em]">商品マスタ</h2><p className="mt-1 text-sm font-semibold text-slate-500">CSVでまとめて取り込むか、商品を1件ずつ追加できます。</p></div><div className="hidden text-right sm:block"><p className="text-2xl font-black">{products.length}</p><p className="text-xs font-bold text-slate-500">登録商品</p></div></div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-black">CSVで一括登録</p><p className="mt-1 text-xs font-semibold leading-5 text-slate-500">必須列：code、name、price、category</p>
              <label className="mt-4 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50 px-4 text-center transition hover:border-emerald-500"><span className="text-2xl" aria-hidden="true">↑</span><span className="mt-1 text-sm font-black text-emerald-900">CSVファイルを選択</span><span className="mt-1 text-xs text-emerald-700">登録済み商品を置き換えます</span><input type="file" accept=".csv,text/csv" onChange={importCsv} className="sr-only" /></label>
              <a href="/templates/product-master-template.csv" download className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-slate-100 text-sm font-black text-slate-700">テンプレートをダウンロード</a>
            </div>

            <form onSubmit={submitProduct} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-black">商品を1件追加</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="col-span-2 text-xs font-black">商品コード<input required value={productForm.code} onChange={(event) => setProductForm((current) => ({ ...current, code: event.target.value }))} placeholder="JAN / EANコード" className={fieldClassName} /></label>
                <label className="col-span-2 text-xs font-black">商品名<input required value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} placeholder="商品名" className={fieldClassName} /></label>
                <label className="text-xs font-black">価格<input required min="0" step="1" type="number" value={productForm.price || ""} onChange={(event) => setProductForm((current) => ({ ...current, price: Number(event.target.value) }))} placeholder="0" className={fieldClassName} /></label>
                <label className="text-xs font-black">カテゴリ<input required value={productForm.category} onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value }))} placeholder="乳製品" className={fieldClassName} /></label>
              </div>
              <button type="submit" className="mt-4 min-h-12 w-full rounded-2xl bg-emerald-700 px-4 font-black text-white transition active:scale-[0.99]">商品を追加</button>
            </form>
          </div>

          {(importMessage || importError) && <p className={`mt-3 rounded-2xl border px-4 py-3 text-sm font-black ${importError ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`} aria-live="polite">{importError || importMessage}</p>}

          <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><p className="font-black">登録済み商品</p><p className="text-xs font-semibold text-slate-500">{products.length}商品・{categories}カテゴリ</p></div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-800">Appと共有中</span></div>
            <div className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
              {products.map((product) => (
                <article key={product.code} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-2xl" aria-hidden="true">{productIcon(product)}</div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{product.name}</p><p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{product.code}・{product.category}</p></div>
                  <p className="text-sm font-black text-emerald-800">{yen.format(product.price)}</p>
                  <button type="button" onClick={() => removeProduct(product.code)} className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-red-50 hover:text-red-600" aria-label={`${product.name}を削除`}>×</button>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main></UtilityShell>
  );
}
