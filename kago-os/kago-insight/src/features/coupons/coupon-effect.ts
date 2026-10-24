import { formatRate, rate } from "@/lib/format";

/**
 * DEMO-09 クーポン効果の集計と、次の改善案の選び方。
 * 画面から切り離し、手計算と照合しやすい純粋な関数にしておく。
 */

export type CouponOffer = {
  offer_id: string;
  product_name: string;
  trigger_product_name: string;
  discount_percent: number;
  list_price: number;
  unit_discount: number;
  distributed: number;
  claimed: number;
  purchased: number;
};

export type CouponSegment = {
  key: string;
  label: string;
  distributed: number;
  claimed: number;
};

export type OfferSummary = {
  offer: CouponOffer;
  claimRate: number | null;
  purchaseRate: number | null;
  discountTotal: number;
  salesTotal: number;
  /** 値引きが0円なら「1円あたり」は定義できないため null（0ではない） */
  salesPerYen: number | null;
};

/** 値引き単価は DB の kago_offer_unit_discount と同じ floor(price * percent / 100) */
export function summarizeOffer(offer: CouponOffer): OfferSummary {
  const discountTotal = offer.purchased * offer.unit_discount;
  const salesTotal = offer.purchased * (offer.list_price - offer.unit_discount);
  return {
    offer,
    claimRate: rate(offer.claimed, offer.distributed),
    purchaseRate: rate(offer.purchased, offer.claimed),
    discountTotal,
    salesTotal,
    salesPerYen: discountTotal === 0 ? null : salesTotal / discountTotal,
  };
}

export function summarizeTotal(summaries: OfferSummary[]) {
  const sum = (pick: (s: OfferSummary) => number) => summaries.reduce((acc, s) => acc + pick(s), 0);
  const distributed = sum((s) => s.offer.distributed);
  const claimed = sum((s) => s.offer.claimed);
  const purchased = sum((s) => s.offer.purchased);
  const discountTotal = sum((s) => s.discountTotal);
  const salesTotal = sum((s) => s.salesTotal);
  return {
    distributed,
    claimed,
    purchased,
    discountTotal,
    salesTotal,
    claimRate: rate(claimed, distributed),
    purchaseRate: rate(purchased, claimed),
    salesPerYen: discountTotal === 0 ? null : salesTotal / discountTotal,
  };
}

export function formatPerYen(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}円`;
}

export type Suggestion = {
  key: string;
  /** 見直す / 確かめる / 続ける のどれか。色と並び順に使う */
  kind: "review" | "check" | "keep";
  title: string;
  evidence: string;
  action: string;
};

/** 履歴あり・なしの受け取り率の差がこれ以上なら改善案に出す（ポイント） */
const SEGMENT_GAP_POINTS = 15;

/**
 * 数値から次に検討する候補を選ぶ固定ルール。
 * 比較対象（値引きしない場合）を置いていないため、「値引きで売れた」とは書かず、
 * 「見直す候補」「確かめる点」として示す。
 */
export function buildSuggestions(
  summaries: OfferSummary[],
  segments: CouponSegment[],
): Suggestion[] {
  const total = summarizeTotal(summaries);
  const suggestions: Suggestion[] = [];

  for (const s of summaries) {
    if (s.offer.distributed > 0 && s.offer.claimed === 0) {
      suggestions.push({
        key: `no-claim-${s.offer.offer_id}`,
        kind: "review",
        title: `${s.offer.product_name}は受け取りが0件`,
        evidence: `配布 ${s.offer.distributed}件・受け取り 0件（きっかけ商品：${s.offer.trigger_product_name}）`,
        action: "きっかけ商品との組み合わせか、値引き率を見直す候補です。",
      });
    }
  }

  // 受け取られたのに購入まで進んでいないもの。全体の率を下回るものだけを出す
  if (total.purchaseRate !== null) {
    for (const s of summaries) {
      if (s.purchaseRate !== null && s.purchaseRate < total.purchaseRate) {
        suggestions.push({
          key: `low-purchase-${s.offer.offer_id}`,
          kind: "check",
          title: `${s.offer.product_name}は受け取り後の購入率が全体より低い`,
          evidence: `受け取り後の購入率 ${formatRate(s.purchaseRate)}（全体 ${formatRate(total.purchaseRate)}）`,
          action: "売場での見つけやすさや、クーポンの使える期限の案内を確かめる点です。",
        });
      }
    }
  }

  const ranked = summaries
    .filter((s): s is OfferSummary & { salesPerYen: number } => s.salesPerYen !== null)
    .sort((a, b) => b.salesPerYen - a.salesPerYen);
  if (ranked.length >= 2) {
    const best = ranked[0];
    suggestions.push({
      key: `best-per-yen-${best.offer.offer_id}`,
      kind: "keep",
      title: `${best.offer.product_name}（${best.offer.discount_percent}%OFF）は値引き1円あたりの売上が最大`,
      evidence: `${formatPerYen(best.salesPerYen)}（次点 ${ranked[1].offer.product_name} ${formatPerYen(ranked[1].salesPerYen)}）`,
      action: "同じ値引き率で続けるか、ほかの組み合わせでも同程度の率を試す候補です。",
    });
  }

  const withHistory = segments.find((s) => s.key === "with_history");
  const withoutHistory = segments.find((s) => s.key === "without_history");
  if (withHistory && withoutHistory) {
    const a = rate(withHistory.claimed, withHistory.distributed);
    const b = rate(withoutHistory.claimed, withoutHistory.distributed);
    if (a !== null && b !== null && (a - b) * 100 >= SEGMENT_GAP_POINTS) {
      suggestions.push({
        key: "segment-gap",
        kind: "check",
        title: "購入履歴なしの人の受け取り率が低い",
        evidence: `${withoutHistory.label} ${formatRate(b)}・${withHistory.label} ${formatRate(a)}`,
        action: "初めての人向けの見せ方（表示する位置や文言）を検討する候補です。",
      });
    }
  }

  const order = { review: 0, check: 1, keep: 2 } as const;
  return suggestions.sort((x, y) => order[x.kind] - order[y.kind]);
}
