import couponEffect from "@/data/mock/coupon-effect.json";
import { formatRate, formatYen, rate } from "@/lib/format";

/**
 * DEMO-09 クーポンの効果。
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

type Offer = (typeof couponEffect.offers)[number];

/** 値引き単価は DB の kago_offer_unit_discount と同じ floor(price * percent / 100) */
function totals(offer: Offer) {
  const discountTotal = offer.purchased * offer.unit_discount;
  const salesTotal = offer.purchased * (offer.list_price - offer.unit_discount);
  return {
    discountTotal,
    salesTotal,
    // 値引きが0円なら「1円あたり」は定義できない。0ではなく対象なしとして扱う。
    salesPerYen: discountTotal === 0 ? null : salesTotal / discountTotal,
  };
}

export function CouponEffectScreen() {
  const { offers, segments } = couponEffect;

  const distributed = offers.reduce((sum, o) => sum + o.distributed, 0);
  const claimed = offers.reduce((sum, o) => sum + o.claimed, 0);
  const purchased = offers.reduce((sum, o) => sum + o.purchased, 0);

  const funnel = [
    { label: "配布", value: distributed, step: "var(--viz-step-1)" },
    { label: "受け取り", value: claimed, step: "var(--viz-step-2)" },
    { label: "購入", value: purchased, step: "var(--viz-step-3)" },
  ];

  const perYen = offers.map((offer) => ({ offer, ...totals(offer) }));
  const maxPerYen = Math.max(...perYen.map((row) => row.salesPerYen ?? 0), 1);
  const maxSegment = Math.max(...segments.map((s) => s.distributed), 1);

  return (
    <div className="grid gap-6">
      <p className="inline-block w-fit rounded bg-amber-100 px-3 py-1.5 text-sm font-bold text-amber-900">
        サンプルデータ — 実際の計測値ではありません
      </p>

      {/* 先頭の1数字。この画面が何の話かを一目で示す */}
      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
        <p className="text-sm text-[var(--muted)]">配ったクーポンの受け取り率</p>
        <p className="mt-1 text-5xl font-bold tabular-nums">
          {formatRate(rate(claimed, distributed))}
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          配布 {distributed.toLocaleString("ja-JP")} 件のうち {claimed.toLocaleString("ja-JP")} 件
        </p>
      </section>

      {/* ファネル */}
      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
        <h2 className="text-base font-bold">配布から購入までの段階</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">クーポン3種の合計。件数</p>
        <div className="mt-4 grid gap-3">
          {funnel.map((stage) => (
            <div key={stage.label} className="grid grid-cols-[6rem_1fr] items-center gap-3">
              <span className="text-sm font-bold">{stage.label}</span>
              <div className="flex items-center gap-3">
                <div
                  className="h-5 rounded-r"
                  style={{
                    width: `${(stage.value / distributed) * 100}%`,
                    background: stage.step,
                  }}
                  title={`${stage.label} ${stage.value}件`}
                />
                <span className="text-sm font-bold tabular-nums">
                  {stage.value.toLocaleString("ja-JP")}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* クーポン別 */}
      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
        <h2 className="text-base font-bold">クーポン別の内訳</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-[var(--muted)]">
                <th className="py-2 pr-3 font-normal">クーポン</th>
                <th className="py-2 pr-3 font-normal">きっかけ商品</th>
                <th className="py-2 pr-3 text-right font-normal">配布</th>
                <th className="py-2 pr-3 text-right font-normal">受け取り</th>
                <th className="py-2 pr-3 text-right font-normal">購入</th>
                <th className="py-2 pr-3 text-right font-normal">受け取り率</th>
                <th className="py-2 text-right font-normal">受け取り後の購入率</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => (
                <tr key={offer.offer_id} className="border-b border-[var(--line)]">
                  <td className="py-2 pr-3 font-bold">
                    {offer.product_name} {offer.discount_percent}%OFF
                  </td>
                  <td className="py-2 pr-3 text-[var(--muted)]">{offer.trigger_product_name}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{offer.distributed}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{offer.claimed}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{offer.purchased}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatRate(rate(offer.claimed, offer.distributed))}
                  </td>
                  {/* 受け取りが0件なら率は0%ではなく「—（対象なし）」 */}
                  <td className="py-2 text-right tabular-nums">
                    {formatRate(rate(offer.purchased, offer.claimed))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">
          受け取りが0件のクーポンは、購入率の分母が0になるため「—」と表示します（0%ではありません）。
        </p>
      </section>

      {/* 値引き1円あたりの売上 */}
      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
        <h2 className="text-base font-bold">値引き1円あたりの売上</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          値引き後の売上 ÷ 値引き総額。値引きが0円のものは「—」
        </p>
        <div className="mt-4 grid gap-3">
          {perYen.map(({ offer, salesTotal, discountTotal, salesPerYen }) => (
            <div key={offer.offer_id} className="grid grid-cols-[11rem_1fr] items-center gap-3">
              <span className="truncate text-sm font-bold" title={offer.product_name}>
                {offer.product_name}
              </span>
              <div className="flex items-center gap-3">
                <div className="h-5 flex-1 rounded-r bg-[var(--viz-track)]">
                  {salesPerYen === null ? null : (
                    <div
                      className="h-5 rounded-r bg-[var(--viz-bar)]"
                      style={{ width: `${(salesPerYen / maxPerYen) * 100}%` }}
                      title={`${offer.product_name} 値引き1円あたり ${salesPerYen.toFixed(1)}円`}
                    />
                  )}
                </div>
                <span className="w-28 shrink-0 text-right text-sm font-bold tabular-nums">
                  {salesPerYen === null ? "—" : `${salesPerYen.toFixed(1)}円`}
                </span>
                <span className="hidden w-44 shrink-0 text-right text-xs text-[var(--muted)] tabular-nums sm:block">
                  売上 {formatYen(salesTotal)} / 値引き {formatYen(discountTotal)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 履歴あり / なし */}
      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
        <h2 className="text-base font-bold">購入履歴の有無別の受け取り率</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">棒の長さは配布件数、数字は受け取り率</p>
        <div className="mt-4 grid gap-3">
          {segments.map((segment) => (
            <div key={segment.key} className="grid grid-cols-[9rem_1fr] items-center gap-3">
              <span className="text-sm font-bold">{segment.label}</span>
              <div className="flex items-center gap-3">
                <div
                  className="h-5 rounded-r bg-[var(--viz-bar)]"
                  style={{ width: `${(segment.distributed / maxSegment) * 100}%` }}
                  title={`${segment.label} 配布 ${segment.distributed}件・受け取り ${segment.claimed}件`}
                />
                <span className="w-16 shrink-0 text-sm font-bold tabular-nums">
                  {formatRate(rate(segment.claimed, segment.distributed))}
                </span>
                <span className="shrink-0 text-xs text-[var(--muted)] tabular-nums">
                  {segment.claimed} / {segment.distributed} 件
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-xs leading-relaxed text-[var(--muted)]">
        この画面は配ったクーポンに対する反応を並べたものです。値引きをしなかった場合と比べていないため、
        「値引きをしたから売れた」ことを示すものではありません。比較対象を置いた検証は INS-04 で扱います。
      </p>
    </div>
  );
}
