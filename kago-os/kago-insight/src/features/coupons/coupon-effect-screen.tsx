import Link from "next/link";
import couponEffect from "@/data/mock/coupon-effect.json";
import { formatRate, formatYen, rate } from "@/lib/format";
import {
  buildSuggestions,
  formatPerYen,
  summarizeOffer,
  summarizeTotal,
  type Suggestion,
} from "./coupon-effect";

/**
 * DEMO-09 クーポンの効果。結果を比べ、次の販促の見直しにつなぐダッシュボード。
 *
 * 値はすべて src/data/mock/coupon-effect.json の固定値で、実測ではない。
 * 画面内に「サンプルデータ」を明示し、実測と誤認させない。
 *
 * 数え方
 *   配布   offer_events の offer_shown に相当
 *   受け取り visit_offer_claims に相当
 *   購入   order_discounts に相当
 * 実データでは受け取りと購入は店舗担当者の権限で読めないため、
 * ここをDBへ差し替えるには DB-09 と同じ形の集計関数が必要（Coreへ依頼済み）。
 */

const STAGES = [
  { key: "distributed", label: "配布", step: "var(--viz-step-1)" },
  { key: "claimed", label: "受け取り", step: "var(--viz-step-2)" },
  { key: "purchased", label: "購入", step: "var(--viz-step-3)" },
] as const;

const SUGGESTION_STYLE: Record<Suggestion["kind"], { label: string; className: string }> = {
  review: { label: "見直す", className: "bg-rose-100 text-rose-900" },
  check: { label: "確かめる", className: "bg-amber-100 text-amber-900" },
  keep: { label: "続ける", className: "bg-emerald-100 text-emerald-900" },
};

const panel = "rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5";

export function CouponEffectScreen() {
  const { offers, segments, period_label } = couponEffect;

  const summaries = offers.map(summarizeOffer);
  const total = summarizeTotal(summaries);
  const suggestions = buildSuggestions(summaries, segments);

  // クーポン同士を比べられるよう、ファネルの棒は全クーポン共通の目盛りにする
  const maxDistributed = Math.max(...offers.map((o) => o.distributed), 1);
  const maxPerYen = Math.max(...summaries.map((s) => s.salesPerYen ?? 0), 1);

  const kpis = [
    {
      label: "配布",
      value: `${total.distributed.toLocaleString("ja-JP")}件`,
      note: `クーポン${offers.length}種の合計`,
    },
    {
      label: "受け取り率",
      value: formatRate(total.claimRate),
      note: `${total.claimed} / ${total.distributed} 件`,
    },
    {
      label: "受け取り後の購入率",
      value: formatRate(total.purchaseRate),
      note: `${total.purchased} / ${total.claimed} 件`,
    },
    {
      label: "値引き1円あたりの売上",
      value: formatPerYen(total.salesPerYen),
      note: `売上 ${formatYen(total.salesTotal)} / 値引き ${formatYen(total.discountTotal)}`,
    },
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="rounded bg-amber-100 px-3 py-1.5 text-sm font-bold text-amber-900">
          サンプルデータ — 実際の計測値ではありません
        </p>
        <p className="text-xs text-[var(--muted)]">{period_label}</p>
      </div>

      {/* 先頭の数字。全体の結果を一目で示す */}
      <section aria-label="全体の結果" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={panel}>
            <p className="text-sm text-[var(--muted)]">{kpi.label}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{kpi.value}</p>
            <p className="mt-1 text-xs text-[var(--muted)] tabular-nums">{kpi.note}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* クーポン別のファネル */}
        <section className={panel}>
          <h2 className="text-base font-bold">クーポン別：配布から購入まで</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            棒は全クーポン共通の目盛り（最大 {maxDistributed}件）。右は件数
          </p>
          <ul className="mt-2 flex flex-wrap gap-4 text-xs text-[var(--muted)]">
            {STAGES.map((stage) => (
              <li key={stage.key} className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm" style={{ background: stage.step }} />
                {stage.label}
              </li>
            ))}
          </ul>
          <div className="mt-4 grid gap-5">
            {summaries.map(({ offer, claimRate, purchaseRate }) => (
              <div key={offer.offer_id}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-sm font-bold">
                    {offer.product_name} {offer.discount_percent}%OFF
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    きっかけ：{offer.trigger_product_name}
                  </p>
                </div>
                <div className="mt-2 grid gap-1">
                  {STAGES.map((stage) => {
                    const value = offer[stage.key];
                    return (
                      <div key={stage.key} className="flex items-center gap-2">
                        <span className="w-14 shrink-0 text-xs text-[var(--muted)]">{stage.label}</span>
                        {/* 棒は必ずトラックの中に収める。外に置くとラベルが画面外へ押し出される */}
                        <div className="h-3.5 min-w-0 flex-1 rounded-r bg-[var(--viz-track)]">
                          <div
                            className="h-3.5 rounded-r"
                            style={{
                              width: `${(value / maxDistributed) * 100}%`,
                              background: stage.step,
                            }}
                            title={`${offer.product_name} ${stage.label} ${value}件`}
                          />
                        </div>
                        <span className="w-8 shrink-0 text-right text-xs font-bold tabular-nums">
                          {value}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-[var(--muted)] tabular-nums">
                  受け取り率 <b className="text-[var(--ink)]">{formatRate(claimRate)}</b>
                  {" ・ "}受け取り後の購入率 <b className="text-[var(--ink)]">{formatRate(purchaseRate)}</b>
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-[var(--muted)]">
            受け取りが0件のクーポンは、購入率の分母が0になるため「—」と表示します（0%ではありません）。
          </p>
        </section>

        <div className="grid content-start gap-6">
          {/* 値引き1円あたりの売上 */}
          <section className={panel}>
            <h2 className="text-base font-bold">値引き1円あたりの売上</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              値引き後の売上 ÷ 値引き総額。値引きが0円のものは「—」
            </p>
            <div className="mt-4 grid gap-3">
              {summaries.map(({ offer, salesTotal, discountTotal, salesPerYen }) => (
                <div key={offer.offer_id}>
                  <div className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate text-sm font-bold" title={offer.product_name}>
                      {offer.product_name}
                    </span>
                    <div className="h-4 min-w-0 flex-1 rounded-r bg-[var(--viz-track)]">
                      {salesPerYen === null ? null : (
                        <div
                          className="h-4 rounded-r bg-[var(--viz-bar)]"
                          style={{ width: `${(salesPerYen / maxPerYen) * 100}%` }}
                          title={`${offer.product_name} 値引き1円あたり ${formatPerYen(salesPerYen)}`}
                        />
                      )}
                    </div>
                    <span className="w-16 shrink-0 text-right text-sm font-bold tabular-nums">
                      {formatPerYen(salesPerYen)}
                    </span>
                  </div>
                  <p className="mt-0.5 pl-35 text-xs text-[var(--muted)] tabular-nums">
                    売上 {formatYen(salesTotal)} / 値引き {formatYen(discountTotal)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* 履歴あり / なし */}
          <section className={panel}>
            <h2 className="text-base font-bold">購入履歴の有無別の受け取り率</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">棒の長さは受け取り率（0〜100%）</p>
            <div className="mt-4 grid gap-3">
              {segments.map((segment) => {
                const claimRate = rate(segment.claimed, segment.distributed);
                return (
                  <div key={segment.key} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-sm font-bold">{segment.label}</span>
                    <div className="h-4 min-w-0 flex-1 rounded-r bg-[var(--viz-track)]">
                      <div
                        className="h-4 rounded-r bg-[var(--viz-bar)]"
                        style={{ width: `${(claimRate ?? 0) * 100}%` }}
                        title={`${segment.label} 配布 ${segment.distributed}件・受け取り ${segment.claimed}件`}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right text-sm font-bold tabular-nums">
                      {formatRate(claimRate)}
                    </span>
                    <span className="w-20 shrink-0 text-right text-xs text-[var(--muted)] tabular-nums">
                      {segment.claimed} / {segment.distributed} 件
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {/* 結果を次の販促設定へつなぐ */}
      <section className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">次の販促で検討すること</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              上の数値から固定のルールで選んだ候補です。効果を保証するものではありません。
            </p>
          </div>
          <Link
            href="/promotions"
            className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
          >
            販促設定で値引き率を見直す →
          </Link>
        </div>
        {suggestions.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">いまの数値から挙げる候補はありません。</p>
        ) : (
          <ol className="mt-4 grid gap-3 md:grid-cols-2">
            {suggestions.map((s) => {
              const style = SUGGESTION_STYLE[s.kind];
              return (
                <li key={s.key} className="rounded-md border border-[var(--line)] p-4">
                  <span className={`rounded px-2 py-0.5 text-xs font-bold ${style.className}`}>
                    {style.label}
                  </span>
                  <p className="mt-2 text-sm font-bold">{s.title}</p>
                  <p className="mt-1 text-xs text-[var(--muted)] tabular-nums">{s.evidence}</p>
                  <p className="mt-2 text-sm">{s.action}</p>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <p className="text-xs leading-relaxed text-[var(--muted)]">
        この画面は配ったクーポンに対する反応を並べたものです。値引きをしなかった場合と比べていないため、
        「値引きをしたから売れた」ことを示すものではありません。比較対象を置いた検証は INS-04 で扱います。
      </p>
    </div>
  );
}
