"use client";

import { useState } from "react";
import {
  dataOriginLabel,
  measurementStatusLabel,
  placementTypeLabel,
} from "@/lib/labels";
import {
  SMALL_SAMPLE_THRESHOLD,
  formatCountOrUnmeasured,
  formatRate,
  formatYen,
  isSmallSample,
  rate,
} from "@/lib/format";
import { EmptyState } from "@/components/state";
import type { AppMetricRow, PlacementType, SignageMetricRow } from "@/lib/types";

/** 指標の定義。画面から参照できるようにしておく（INS-03の完了条件） */
const DEFINITIONS: { key: string; label: string; formula: string; source: string }[] = [
  {
    key: "impressions",
    label: "実表示数",
    formula: "実表示された「来店・商品・種別」の組の数",
    source: "選ばれただけで画面に出なかった枠は数えない（9.1）",
  },
  {
    key: "impression_visits",
    label: "表示来店数",
    formula: "実表示が1件以上あった来店の数",
    source: "少数判定に使う（D-10）",
  },
  {
    key: "click_rate",
    label: "クリック率",
    formula: "クリックがあった組の数 ÷ 実表示数",
    source: "同じ組で何度押しても1件（9.2）",
  },
  {
    key: "add_rate",
    label: "提案経由の追加率",
    formula: "提案カードから追加された組の数 ÷ 実表示数",
    source: "source = recommendation のもの（9.2）",
  },
  {
    key: "purchase_rate",
    label: "表示後の購入率",
    formula: "実表示された組のうち注文明細に含まれる組の数 ÷ 実表示数",
    source: "購入は注文・明細を正本とする（D-06）",
  },
];

export function MetricsScreen({
  appRows,
  signageRows,
  subjectNames,
}: {
  appRows: AppMetricRow[];
  signageRows: SignageMetricRow[];
  subjectNames: Record<string, string>;
}) {
  const [showDefinitions, setShowDefinitions] = useState(false);

  if (appRows.length === 0 && signageRows.length === 0) {
    return <EmptyState message="まだ記録がありません。" />;
  }

  const origins = Array.from(
    new Set([...appRows.map((r) => r.data_origin), ...signageRows.map((r) => r.data_origin)]),
  );
  const hasNonOperated = origins.some((o) => o !== "operated");

  // 種別をまたいで足してよいのは、組に種別を含む指標だけ（9.1）。
  // 表示来店数・購入件数・購入金額は同じ来店や注文を重複して数えるため合計しない（9.1.1）。
  const totals = {
    impressions: appRows.reduce((sum, r) => sum + r.impressions, 0),
    plays: signageRows.reduce((sum, r) => sum + r.plays, 0),
    playSeconds: signageRows.reduce((sum, r) => sum + r.play_seconds, 0),
  };

  return (
    <div className="grid gap-6">
      {hasNonOperated ? (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          実際の操作以外のデータが含まれています（
          {origins.map((o) => dataOriginLabel[o]).join("、")}）。実測と混ぜて成果を作らないでください。
        </p>
      ) : null}

      <section>
        <div className="grid gap-3 sm:grid-cols-2">
          <StatTile
            label="提案の実表示数"
            value={totals.impressions.toLocaleString("ja-JP")}
            unit="件"
            note="来店・商品・種別の組で数えるため、種別をまたいでも重複しません"
          />
          <StatTile
            label="サイネージ再生"
            value={totals.plays.toLocaleString("ja-JP")}
            unit={`回 / ${totals.playSeconds.toLocaleString("ja-JP")}秒`}
            note="Appの数値とは合算しません"
          />
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          来店数・購入件数・購入金額の全体値はここに出しません。種別ごとの値を足すと同じ来店や注文を重複して数えるため、
          注文から別に集計する必要があります（common-spec 9.1.1）。この画面では種別ごとの内訳だけを示します。
        </p>
      </section>

      <AppSection rows={appRows} subjectNames={subjectNames} />
      <SignageSection rows={signageRows} subjectNames={subjectNames} />

      <section>
        <button
          type="button"
          onClick={() => setShowDefinitions((v) => !v)}
          className="text-sm font-bold text-[var(--accent)] underline"
        >
          {showDefinitions ? "指標の定義を閉じる" : "指標の定義を見る"}
        </button>
        {showDefinitions ? (
          <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--panel)]">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--line)] text-left text-xs text-[var(--muted)]">
                <tr>
                  <Th>指標</Th>
                  <Th>計算</Th>
                  <Th>補足</Th>
                </tr>
              </thead>
              <tbody>
                {DEFINITIONS.map((d) => (
                  <tr key={d.key} className="border-b border-[var(--line)] last:border-0">
                    <Td className="font-bold whitespace-nowrap">{d.label}</Td>
                    <Td>{d.formula}</Td>
                    <Td className="text-[var(--muted)]">{d.source}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-[var(--line)] p-3 text-xs text-[var(--muted)]">
              定義は docs/specs/common-spec.md 9章に従います。分母が0の率は 0% ではなく「—（対象なし）」と表示します。
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** 行がどの広告・販促のものかを表す。DB-09 は ID しか返さないため画面側で解決する。 */
function subjectOf(
  row: { ad_placement_id: string | null; promotion_version_id: string | null; rule_version: string | null },
  names: Record<string, string>,
): string {
  const id = row.ad_placement_id ?? row.promotion_version_id;
  if (id) return names[id] ?? id;
  if (row.rule_version) return `ルール ${row.rule_version}`;
  return "—";
}

function AppSection({
  rows,
  subjectNames,
}: {
  rows: AppMetricRow[];
  subjectNames: Record<string, string>;
}) {
  const order: PlacementType[] = ["sponsored", "store_promo", "organic"];
  const sorted = [...rows].sort(
    (a, b) => order.indexOf(a.placement_type) - order.indexOf(b.placement_type),
  );

  return (
    <section>
      <h2 className="text-sm font-bold text-[var(--muted)]">App（母数は来店単位）</h2>
      {sorted.length === 0 ? (
        <div className="mt-2">
          <EmptyState message="Appの記録はまだありません。" />
        </div>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--panel)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--line)] text-left text-xs text-[var(--muted)]">
              <tr>
                <Th>提案の種別</Th>
                <Th>対象</Th>
                <Th align="right">選定枠</Th>
                <Th align="right">実表示</Th>
                <Th align="right">表示来店</Th>
                <Th align="right">クリック率</Th>
                <Th align="right">追加率</Th>
                <Th align="right">削除</Th>
                <Th align="right">購入率</Th>
                <Th align="right">購入金額</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <AppRow
                  key={`${row.placement_type}-${row.ad_placement_id ?? row.promotion_version_id ?? "none"}`}
                  row={row}
                  subject={subjectOf(row, subjectNames)}
                />
              ))}
            </tbody>
          </table>
          <p className="border-t border-[var(--line)] p-3 text-xs text-[var(--muted)]">
            種別ごとの購入を足し合わせないでください。同じ購入を二重に数えることがあります（common-spec 9.1.1）。
            全体の購入件数・金額が必要な場合は注文から別に集計します。
          </p>
        </div>
      )}
    </section>
  );
}

function AppRow({ row, subject }: { row: AppMetricRow; subject: string }) {
  const small = isSmallSample(row.impression_visits);
  const clickRate = rate(row.clicks, row.impressions);
  const addRate = rate(row.recommendation_adds, row.impressions);
  const purchaseRate = rate(row.post_impression_purchases, row.impressions);

  return (
    <tr className="border-b border-[var(--line)] last:border-0">
      <Td className="font-bold whitespace-nowrap">
        {placementTypeLabel[row.placement_type]}
        {row.data_origin !== "operated" ? (
          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-900">
            {dataOriginLabel[row.data_origin]}
          </span>
        ) : null}
      </Td>
      <Td className="text-[var(--muted)]">{subject}</Td>
      <Td align="right">{row.selection_items}</Td>
      <Td align="right" className="font-bold">
        {row.impressions}
      </Td>
      <Td align="right">{row.impression_visits}</Td>
      <RateCell value={clickRate} small={small} />
      <RateCell value={addRate} small={small} />
      <Td align="right">{row.recommendation_removes}</Td>
      <RateCell value={purchaseRate} small={small} />
      <Td align="right">{formatYen(row.post_impression_amount)}</Td>
    </tr>
  );
}

/**
 * 率の表示。
 * - 分母0は 0% ではなく「—」（common-spec 9.1.1）
 * - 表示来店数が閾値未満なら「参考値」と注記（D-10）
 */
function RateCell({ value, small }: { value: number | null; small: boolean }) {
  if (value === null) {
    return (
      <Td align="right" className="text-[var(--muted)]">
        <span title="分母が0のため算出できません">—</span>
      </Td>
    );
  }
  return (
    <Td align="right">
      <span className={small ? "text-[var(--muted)]" : undefined}>{formatRate(value)}</span>
      {small ? (
        <span
          className="ml-1 text-xs text-[var(--muted)]"
          title={`表示来店数が${SMALL_SAMPLE_THRESHOLD}未満のため参考値です`}
        >
          参考
        </span>
      ) : null}
    </Td>
  );
}

/* ------------------------------------------------------------------ */

function SignageSection({
  rows,
  subjectNames,
}: {
  rows: SignageMetricRow[];
  subjectNames: Record<string, string>;
}) {
  return (
    <section>
      <h2 className="text-sm font-bold text-[var(--muted)]">
        Signage（画面・時間帯単位。Appとは合算しません）
      </h2>
      {rows.length === 0 ? (
        <div className="mt-2">
          <EmptyState message="サイネージの記録はまだありません。" />
        </div>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--panel)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--line)] text-left text-xs text-[var(--muted)]">
              <tr>
                <Th>時間帯</Th>
                <Th>提案の種別</Th>
                <Th>対象</Th>
                <Th align="right">再生</Th>
                <Th align="right">再生秒数</Th>
                <Th align="right">推定視認</Th>
                <Th align="right">同時間帯の販売数</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.hour}-${row.ad_placement_id ?? row.promotion_version_id}`}
                  className="border-b border-[var(--line)] last:border-0"
                >
                  <Td className="whitespace-nowrap">
                    {new Date(row.hour).toLocaleTimeString("ja-JP", {
                      timeZone: "Asia/Tokyo",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    台
                  </Td>
                  <Td className="whitespace-nowrap">{placementTypeLabel[row.placement_type]}</Td>
                  <Td className="text-[var(--muted)]">
                    {subjectOf({ ...row, rule_version: null }, subjectNames)}
                  </Td>
                  <Td align="right">{row.plays}回</Td>
                  <Td align="right">{row.play_seconds}秒</Td>
                  <Td align="right">
                    {row.measurement_status === "measured" ? (
                      `${formatCountOrUnmeasured(row.estimated_viewers)}人`
                    ) : (
                      <span className="text-[var(--muted)]">
                        {measurementStatusLabel[row.measurement_status]}
                      </span>
                    )}
                  </Td>
                  <Td align="right">{row.same_hour_product_sales}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-[var(--line)] p-3 text-xs text-[var(--muted)]">
            推定視認が「未計測」の行を0人として扱わないでください。
            同時間帯の販売数は参考値で、サイネージを見た人の購入ではありません（common-spec 9.3）。
          </p>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function StatTile({
  label,
  value,
  unit,
  note,
}: {
  label: string;
  value: string;
  unit: string;
  note?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-1">
        <span className="text-3xl font-bold">{value}</span>
        <span className="ml-1 text-sm text-[var(--muted)]">{unit}</span>
      </p>
      {note ? <p className="mt-2 text-xs text-[var(--muted)]">{note}</p> : null}
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th className={`px-3 py-2 font-bold ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td className={`px-3 py-2 ${align === "right" ? "text-right tabular-nums" : ""} ${className}`}>
      {children}
    </td>
  );
}
