import Link from "next/link";
import couponEffect from "@/data/mock/coupon-effect.json";
import { formatRate, rate } from "@/lib/format";
import {
  buildDashboard,
  changePoints,
  changeRatio,
  formatPerYen,
  formatSigned,
  type OfferSummary,
  type Totals,
  type Verdict,
} from "./coupon-effect";

/**
 * DEMO-09 販促効果と次の打ち手。
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

const panel = "insight-panel p-5 sm:p-6";

const yen = (value: number) => `¥${value.toLocaleString("ja-JP")}`;

const weekday = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});

const VERDICT: Record<Verdict, { label: string; className: string }> = {
  keep: { label: "継続候補", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  expand: { label: "拡大候補", className: "bg-sky-50 text-sky-800 ring-sky-200" },
  review: { label: "見直し候補", className: "bg-amber-50 text-amber-800 ring-amber-300" },
};

export function CouponEffectScreen() {
  const { offers, segments, period, days } = couponEffect;
  const { current, previous, daily, offers: rows } = buildDashboard(offers, days.length);

  const kpis = [
    {
      label: "クーポン経由の売上",
      help: "値引き後の価格 × 購入数",
      value: yen(current.salesTotal),
      change: formatSigned(changeRatio(current.salesTotal, previous.salesTotal), "%"),
      series: daily.map((d) => d.salesTotal),
      tone: "good" as const,
    },
    {
      label: "購入率",
      help: "購入 ÷ 配布",
      value: formatRate(current.purchaseRate),
      change: formatSigned(changePoints(current.purchaseRate, previous.purchaseRate), "pt"),
      series: daily.map((d) => d.purchaseRate ?? 0),
      tone: "good" as const,
    },
    {
      label: "受け取り率",
      help: "受け取り ÷ 配布",
      value: formatRate(current.claimRate),
      change: formatSigned(changePoints(current.claimRate, previous.claimRate), "pt"),
      series: daily.map((d) => d.claimRate ?? 0),
      tone: "good" as const,
    },
    {
      label: "値引き総額",
      help: "値引き単価 × 購入数。店舗の負担額",
      value: yen(current.discountTotal),
      change: formatSigned(changeRatio(current.discountTotal, previous.discountTotal), "%"),
      series: daily.map((d) => d.discountTotal),
      tone: "neutral" as const,
    },
  ];

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-bold tracking-tight">販促効果と次の打ち手</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">結果を振り返り、次の施策へつなげる</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 tabular-nums">
            <CalendarIcon />
            {period.label}
          </span>
          <span className="rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5">
            {period.compare_label}
          </span>
          <span
            className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 font-bold text-sky-800"
            title="実際の計測値ではありません"
          >
            サンプルデータ
          </span>
        </div>
      </header>

      <section aria-label="全体の結果" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={panel}>
            <p className="flex items-center gap-1 text-sm font-bold text-[var(--muted)]">
              {kpi.label}
              <InfoIcon title={kpi.help} />
            </p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <p className="text-3xl font-bold tabular-nums">{kpi.value}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  前週比{" "}
                  <span
                    className={`font-bold tabular-nums ${kpi.tone === "good" ? "text-[var(--good)]" : "text-[var(--ink)]"}`}
                  >
                    {kpi.change}
                  </span>
                </p>
              </div>
              <Sparkline values={kpi.series} tone={kpi.tone} />
            </div>
          </div>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className={panel}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">売上と値引きの推移</h2>
              <p className="text-sm text-[var(--muted)]">クーポン経由・日別</p>
            </div>
            <ul className="flex gap-4 text-xs text-[var(--muted)]">
              <li className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm bg-[var(--viz-step-1)]" />
                売上（円）
              </li>
              <li className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 bg-[var(--viz-line)]" />
                値引き（円）
              </li>
            </ul>
          </div>
          <TrendChart days={days} daily={daily} />
        </section>

        <section className={panel}>
          <h2 className="flex items-center gap-1 text-lg font-bold">
            配布から購入まで
            <InfoIcon title="配布 = クーポン表示、受け取り = クーポン取得、購入 = クーポン利用" />
          </h2>
          <Funnel totals={current} />
          <div className="mt-5 border-t border-[var(--line)] pt-4">
            <p className="text-xs font-bold text-[var(--muted)]">購入履歴別の受け取り率</p>
            <div className="mt-2 grid gap-2">
              {segments.map((segment) => {
                const value = rate(segment.claimed, segment.distributed);
                return (
                  <div
                    key={segment.key}
                    className="flex items-center gap-2 text-sm"
                    title={`${segment.claimed} / ${segment.distributed} 件`}
                  >
                    <span className="w-24 shrink-0">{segment.label}</span>
                    <div className="h-2.5 min-w-0 flex-1 rounded-full bg-[var(--viz-track)]">
                      <div
                        className="h-2.5 rounded-full bg-[var(--viz-step-2)]"
                        style={{ width: `${(value ?? 0) * 100}%` }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right font-bold tabular-nums">{formatRate(value)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <section className={panel}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">
            クーポン別に比較する
            <span className="ml-3 text-sm font-normal text-[var(--muted)]">同期間の実績</span>
          </h2>
          <p className="text-xs text-[var(--muted)]">対象商品が異なるため、単純な優劣ではありません</p>
        </div>
        <ComparisonTable rows={rows} />
      </section>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">
            次の打ち手
            <span className="ml-3 text-sm font-normal text-[var(--muted)]">結果からの仮説を、小さな検証につなげる</span>
          </h2>
          <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
            改善案は仮説です
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-[var(--muted)]">結果をもとに仮説を立て、次のおすすめ・値引き設定へつなげましょう。</p><Link href="/promotions" className="rounded-xl border border-[var(--accent)] bg-white px-4 py-2.5 font-bold text-[var(--accent)]">販促設定へ →</Link></div>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {rows.map((row, index) => (
            <ActionCard key={row.offer.offer_id} row={row} index={index + 1} overall={current} />
          ))}
        </ol>
      </section>

      <p className="text-xs text-[var(--muted)]">
        サンプルデータのため実測値ではありません。値引きしなかった場合と比べていないため、値引きが売上の原因であることは示しません。
        受け取りが0件のときの購入率は、分母が0のため「—」と表示します。
      </p>
    </div>
  );
}

function ComparisonTable({ rows }: { rows: OfferSummary[] }) {
  const maxRate = Math.max(...rows.map((r) => r.current.purchaseRate ?? 0), 0.01);
  const th = "whitespace-nowrap px-3 py-2.5 font-bold";

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--line)]">
      <table className="w-full min-w-[48rem] border-collapse whitespace-nowrap text-sm">
        <thead className="bg-[var(--surface)] text-left text-[var(--muted)]">
          <tr>
            <th className={th}>クーポン</th>
            <th className={`${th} text-right`}>配布</th>
            <th className={`${th} text-right`}>受け取り率</th>
            <th className={th}>購入率</th>
            <th className={`${th} text-right`}>受け取り後の購入率</th>
            <th className={`${th} text-right`}>
              <span title="値引き後の売上 ÷ 値引き総額">値引き1円あたり売上</span>
            </th>
            <th className={th}>判断</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ offer, current, verdict }) => (
            <tr key={offer.offer_id} className="border-t border-[var(--line)]">
              <td className="px-3 py-2.5">
                <p className="font-bold">
                  {offer.product_name}
                  <span className="ml-1.5 text-xs font-normal text-[var(--muted)]">{offer.discount_percent}%OFF</span>
                </p>
                <p className="text-xs text-[var(--muted)]">きっかけ：{offer.trigger_product_name}</p>
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{current.distributed}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatRate(current.claimRate)}</td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-3">
                  <span className="w-12 text-right tabular-nums">{formatRate(current.purchaseRate)}</span>
                  <div className="h-2.5 w-28 rounded-full bg-[var(--viz-track)]">
                    <div
                      className={`h-2.5 rounded-full ${verdict === "review" ? "bg-amber-500" : "bg-[var(--good)]"}`}
                      style={{ width: `${((current.purchaseRate ?? 0) / maxRate) * 100}%` }}
                    />
                  </div>
                </div>
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{formatRate(current.purchaseAfterClaimRate)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatPerYen(current.salesPerYen)}</td>
              <td className="px-3 py-3">
                <span className={`rounded-md px-2 py-1 text-xs font-bold ring-1 ${VERDICT[verdict].className}`}>
                  {VERDICT[verdict].label}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ACTION_BADGE: Record<Verdict, { label: string; dot: string }> = {
  keep: { label: "継続", dot: "bg-emerald-600" },
  expand: { label: "拡大", dot: "bg-sky-600" },
  review: { label: "見直し", dot: "bg-amber-500" },
};

function ActionCard({ row, index, overall }: { row: OfferSummary; index: number; overall: Totals }) {
  const { offer, current, verdict } = row;
  const content = {
    keep: {
      title: `${offer.product_name}のクーポンを継続`,
      reason: `購入率${formatRate(current.purchaseRate)}（全体${formatRate(overall.purchaseRate)}）`,
      metrics: "購入率・値引き総額",
      cta: "設定を確認",
    },
    expand: {
      title: `${offer.product_name}の${offer.discount_percent}%OFFを対象拡大`,
      reason: `値引き1円あたり${formatPerYen(current.salesPerYen)}で最大`,
      metrics: "購入率・値引き1円あたり売上",
      cta: "販促を作成",
    },
    review: {
      title: `${offer.product_name}のきっかけ商品を変更`,
      reason: `配布${current.distributed}件で受け取り${current.claimed}件`,
      metrics: "受け取り率",
      cta: "設定を見直す",
    },
  }[verdict];
  const badge = ACTION_BADGE[verdict];

  return (
    <li className="flex flex-col rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="flex items-center gap-2">
        <span
          className={`grid size-7 place-items-center rounded-full text-sm font-bold text-white ${badge.dot}`}
        >
          {index}
        </span>
        <span className={`rounded-md px-2 py-0.5 text-xs font-bold ring-1 ${VERDICT[verdict].className}`}>
          {badge.label}
        </span>
      </div>
      <p className="mt-3 font-bold">{content.title}</p>
      <p className="mt-1 mb-4 text-sm text-[var(--muted)] tabular-nums">{content.reason}</p>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--line)] pt-3">
        <span className="text-xs text-[var(--muted)]">確認する指標：{content.metrics}</span>
        <Link
          href="/promotions"
          className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-bold ${
            verdict === "expand"
              ? "bg-[var(--good)] text-white hover:opacity-90"
              : "border border-[var(--line)] hover:bg-[var(--surface)]"
          }`}
        >
          {content.cta}
        </Link>
      </div>
    </li>
  );
}

function Funnel({ totals }: { totals: Totals }) {
  const stages = [
    { label: "配布", value: totals.distributed, color: "var(--viz-step-1)" },
    { label: "受け取り", value: totals.claimed, color: "var(--viz-step-2)" },
    { label: "購入", value: totals.purchased, color: "var(--viz-step-3)" },
  ];
  const steps = [totals.claimRate, totals.purchaseAfterClaimRate];
  const max = Math.max(totals.distributed, 1);

  return (
    <div className="mt-4 grid gap-1">
      {stages.map((stage, i) => (
        <div key={stage.label}>
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-sm font-bold">{stage.label}</span>
            <div className="h-9 min-w-0 flex-1">
              <div
                className="h-9 rounded-r-md"
                style={{ width: `${(stage.value / max) * 100}%`, background: stage.color }}
              />
            </div>
            <span className="w-14 shrink-0 text-right text-xl font-bold tabular-nums">
              {stage.value.toLocaleString("ja-JP")}
            </span>
          </div>
          {i < steps.length ? (
            <p className="py-1 pl-[4.75rem] text-sm font-bold text-[var(--viz-step-2)] tabular-nums">
              ↓ {formatRate(steps[i])}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function TrendChart({ days, daily }: { days: string[]; daily: Totals[] }) {
  const width = 640;
  const height = 230;
  const pad = { top: 22, right: 8, bottom: 28, left: 44 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const peak = Math.max(...daily.map((d) => d.salesTotal), 1);
  const step = 2000;
  const top = Math.ceil(peak / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;
  const slot = plotW / daily.length;
  const barW = slot * 0.56;
  const cx = (i: number) => pad.left + slot * i + slot / 2;
  const line = daily.map((d, i) => `${cx(i)},${y(d.discountTotal)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full" role="img" aria-label="日別の売上と値引きの推移">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--line)" />
          <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
            {t.toLocaleString("ja-JP")}
          </text>
        </g>
      ))}
      {daily.map((d, i) => (
        <g key={days[i]}>
          <rect
            x={cx(i) - barW / 2}
            y={y(d.salesTotal)}
            width={barW}
            height={pad.top + plotH - y(d.salesTotal)}
            rx="4"
            fill="var(--viz-step-1)"
          >
            <title>{`${days[i]} 売上 ${d.salesTotal}円・値引き ${d.discountTotal}円`}</title>
          </rect>
          <text x={cx(i)} y={y(d.salesTotal) - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink)">
            {d.salesTotal.toLocaleString("ja-JP")}
          </text>
          <text x={cx(i)} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">
            {weekday.format(new Date(days[i]))}
          </text>
        </g>
      ))}
      <polyline points={line} fill="none" stroke="var(--viz-line)" strokeWidth="2.5" />
      {daily.map((d, i) => (
        <g key={`p-${days[i]}`}>
          <circle cx={cx(i)} cy={y(d.discountTotal)} r="4" fill="var(--viz-line)" stroke="var(--panel)" strokeWidth="1.5" />
          {/* 文字を減らすため、値引きの数値は最終日だけ出す */}
          {i === daily.length - 1 ? (
            <text x={cx(i)} y={y(d.discountTotal) - 9} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--viz-line)">
              {d.discountTotal.toLocaleString("ja-JP")}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

function Sparkline({ values, tone }: { values: number[]; tone: "good" | "neutral" }) {
  const max = Math.max(...values, 1e-9);
  const w = 8;
  const gap = 3;
  const h = 40;
  return (
    <svg width={values.length * (w + gap)} height={h} aria-hidden className="shrink-0">
      {values.map((v, i) => {
        const bh = Math.max((v / max) * h, 2);
        const last = i === values.length - 1;
        const fill = tone === "good" ? "var(--good)" : "var(--muted)";
        return <rect key={i} x={i * (w + gap)} y={h - bh} width={w} height={bh} rx="1.5" fill={fill} opacity={last ? 1 : 0.35 + (i / values.length) * 0.4} />;
      })}
    </svg>
  );
}

function InfoIcon({ title }: { title: string }) {
  return (
    <span
      title={title}
      className="grid size-4 cursor-help place-items-center rounded-full bg-[var(--line)] text-[10px] font-bold text-[var(--muted)]"
    >
      i
    </span>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
