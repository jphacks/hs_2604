"use client";

import { useState } from "react";
import { DiscountScreen } from "@/features/offers/discount-screen";
import { PromotionsScreen } from "@/features/promotions/promotions-screen";
import type { ProductDiscount } from "@/lib/supabase-offers";
import type { Product, Promotion } from "@/lib/types";

/**
 * 販促設定の中身。店員から見れば「今日なにを押すか」という同じ仕事なので1画面にまとめる。
 * DB上は別テーブル（値引き = store_offers、おすすめ = store_promotions / promotion_versions）で、
 * 扱いも違う（値引きは作成後に条件を変えられない）ため、入力欄はタブで分ける。
 */
type TabKey = "discount" | "recommend";

const TABS: { key: TabKey; label: string; note: string }[] = [
  { key: "recommend", label: "おすすめ", note: "おすすめ商品と理由を設定し、Appやサイネージに届けます。" },
  { key: "discount", label: "値引き・クーポン", note: "商品ごとに値引き率を決めます。Appでお客さまにクーポンとして配布されます。" },
];

export function PromotionsTabs({
  discounts,
  promotions,
  products,
}: {
  discounts: ProductDiscount[];
  promotions: Promotion[];
  products: Product[];
}) {
  const [tab, setTab] = useState<TabKey>("recommend");
  const active = TABS.find((t) => t.key === tab)!;

  return (
    <div className="grid gap-6">
      <div role="tablist" aria-label="販促の種類" className="insight-subtabs">
        {TABS.map((item) => {
          const selected = item.key === tab;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(item.key)}
              className={[
                "min-h-12 border-b-[3px] px-5 py-3 text-sm font-bold transition-colors",
                selected
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]",
              ].join(" ")}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <p className="text-sm text-[var(--muted)]">{active.note}</p>

      {tab === "discount" ? (
        <DiscountScreen products={discounts} />
      ) : (
        <PromotionsScreen promotions={promotions} products={products} />
      )}
    </div>
  );
}
