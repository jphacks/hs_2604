import Image from "next/image";
import Link from "next/link";

import { BarcodeImageCheck } from "@/components/demo/barcode-image-check";
import { DEMO_BARCODE_LIST } from "@/lib/demo-barcodes";

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
});

export default function DemoBarcodesPage() {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-950 print:bg-white print:p-0">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 rounded-3xl bg-slate-950 p-6 text-white print:mb-4 print:rounded-none print:bg-white print:p-0 print:text-black">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-[0.22em] text-emerald-400 print:text-black">
                KAGO/OS TEST ASSETS
              </p>
              <h1 className="mt-1 text-2xl font-black">読み取り用デモバーコード</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300 print:text-black">
                この画面を別の端末で表示するか印刷し、KAGO Appのカメラを向けてください。
                広島デモ店のデモ商品に対応した{DEMO_BARCODE_LIST.length}件を用意しています。価格はデモの参考価格で、購入時は店舗の現在価格が適用されます。
              </p>
            </div>
            <Link
              href="/App"
              className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold print:hidden"
            >
              ← KAGO Appへ戻る
            </Link>
          </div>
          <p className="mt-4 rounded-xl bg-white/10 px-4 py-3 text-xs text-slate-200 print:border print:border-black print:bg-white print:text-black">
            印刷する場合：ブラウザの印刷機能を開き、倍率100%・背景グラフィック有効を推奨します。
          </p>
          <nav aria-label="クーポンのデモ用バーコード" className="mt-3 flex flex-wrap gap-3 text-sm underline print:hidden">
            <a href="#barcode-2900000000100">きっかけのパスタ</a>
            <a href="#barcode-2900000000063">新鮮たまご</a>
            <a href="#barcode-2900000000162">トマトパスタソース</a>
            <a href="#barcode-2900000000179">生バジル</a>
          </nav>
          <BarcodeImageCheck
            codes={DEMO_BARCODE_LIST.map((product) => product.code)}
          />
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3 print:gap-2">
          {DEMO_BARCODE_LIST.map((product, index) => (
            <article
              key={product.code}
              id={`barcode-${product.code}`}
              aria-label={product.name}
              className="break-inside-avoid rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:rounded-none print:border-black print:p-2 print:shadow-none"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold text-emerald-700">
                    {String(index + 1).padStart(2, "0")} / {product.category}
                  </p>
                  <h2 className="text-sm font-black leading-tight">{product.name}</h2>
                </div>
                <p className="shrink-0 text-sm font-black text-emerald-800">
                  {yen.format(product.price)}
                </p>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-100 bg-white p-1">
                <Image
                  src={`/demo/barcodes/${product.code}.svg`}
                  alt={`${product.name}のEAN-13バーコード ${product.code}`}
                  width={360}
                  height={150}
                  unoptimized
                  className="h-auto w-full"
                />
              </div>
              <p className="mt-2 text-center text-xs text-slate-600">商品コード：<code className="select-all font-bold">{product.code}</code></p>

              <a
                href={`/demo/barcodes/${product.code}.svg`}
                download={`${product.code}-${product.name}.svg`}
                className="mt-2 block text-center text-xs font-bold text-slate-500 underline underline-offset-4 print:hidden"
              >
                SVG画像を保存
              </a>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
