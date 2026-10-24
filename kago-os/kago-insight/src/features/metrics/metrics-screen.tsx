"use client";

import { useState } from "react";
import { dataOriginLabel, placementTypeLabel } from "@/lib/labels";
import { formatRate, formatYen, rate } from "@/lib/format";
import { EmptyState } from "@/components/state";
import type {
  AppMetricRow,
  OrderTotals,
  PlacementType,
  SelectionCount,
  SignageMetricRow,
} from "@/lib/types";

/** 指標の定義。画面から参照できるようにしておく（INS-03の完了条件） */
const DEFINITIONS: { label: string; formula: string; source: string }[] = [
  {
    label: "実表示数",
    formula: "実表示された「来店・商品・種別」の組の数",
    source: "選ばれただけで画面に出なかった枠は数えない（9.1）",
  },
  {
    label: "表示来店数",
    formula: "実表示が1件以上あった来店の数",
    source: "5未満のとき DB が small_sample を true で返す（D-10）",
  },
  {
    label: "クリック率",
    formula: "クリックがあった組の数 ÷ 実表示数",
    source: "同じ組で何度押しても1件（9.2）",
  },
  {
    label: "提案経由の追加率",
    formula: "提案カードから追加された組の数 ÷ 実表示数",
    source: "source = recommendation のもの（9.2）",
  },
  {
    label: "表示後の購入率",
    formula: "実表示された組のうち注文明細に含まれる組の数 ÷ 実表示数",
    source: "購入は注文・明細を正本とする（D-06）",
  },
  {
    label: "選定枠数",
    formula: "選定記録の提案枠の数",
    source: "実表示とは別のビュー。由来は unclassified（DB-09）",
  },
];

export function MetricsScreen({
  appRows,
  signageRows,
  selectionCounts,
  orderTotals,
  subjectNames,
}: {
  appRows: AppMetricRow[];
  signageRows: SignageMetricRow[];
  selectionCounts: SelectionCount[];
  orderTotals: OrderTotals[];
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
  const totalImpressions = sum(appRows.map((r) => r.impressions));
  const totalPlays = sum(signageRows.map((r) => r.plays));
  const totalPlaySeconds = sum(signageRows.map((r) => r.play_seconds));

  return (
    <div className="grid gap-6">
      {hasNonOperated ? (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          実際の操作以外のデータが含まれています（
          {origins.map((o) => dataOriginLabel[o]).join("、")}）。実測と混ぜて成果を作らないでください。
        </p>
      ) : null}

      <section>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="提案の実表示数"
            value={fmt(totalImpressions)}
            unit="件"
            note="来店・商品・種別の組で数えるため、種別をまたいでも重複しません"
          />
          <StatTile
            label="サイネージ再生"
            value={fmt(totalPlays)}
            unit={`回 / ${fmt(totalPlaySeconds)}秒`}
            note="Appの数値とは合算しません"
          />
          <OrderTotalsTile totals={orderTotals} />
        </div>
      </section>

      <AppSection
        rows={appRows}
        selectionCounts={selectionCounts}
        subjectNames={subjectNames}
      />
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
                  <tr key={d.label} className="border-b border-[var(--line)] last:border-0">
                    <Td className="font-bold whitespace-nowrap">{d.label}</Td>
                    <Td>{d.formula}</Td>
                    <Td className="text-[var(--muted)]">{d.source}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-[var(--line)] p-3 text-xs text-[var(--muted)]">
              定義は docs/specs/common-spec.md 9章に従います。分母が0の率は 0% ではなく「—（対象なし）」、
              公開範囲の外にある指標は「非公開」と表示します。
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function subjectOf(
  row: {
    ad_placement_id: string | null;
    promotion_version_id: string | null;
    rule_version?: number | null;
  },
  names: Record<string, string>,
): string {
  const id = row.ad_placement_id ?? row.promotion_version_id;
  if (id) return names[id] ?? id;
  if (row.rule_version != null) return `ルール 第${row.rule_version}版`;
  return "—";
}

/**
 * Signage の種別は DB から返らない。広告の配信対象IDが入っていれば sponsored、
 * 販促の版IDが入っていれば store_promo。通常推薦は個人向けなのでサイネージには出ない。
 */
function signagePlacementType(row: SignageMetricRow): PlacementType {
  return row.ad_placement_id ? "sponsored" : "store_promo";
}

function AppSection({
  rows,
  selectionCounts,
  subjectNames,
}: {
  rows: AppMetricRow[];
  selectionCounts: SelectionCount[];
  subjectNames: Record<string, string>;
}) {
  const order: PlacementType[] = ["sponsored", "store_promo", "organic"];
  const sorted = [...rows].sort(
    (a, b) => order.indexOf(a.placement_type) - order.indexOf(b.placement_type),
  );

  const slotsOf = (row: AppMetricRow): number | null => {
    const match = selectionCounts.filter(
      (s) =>
        s.placement_type === row.placement_type &&
        s.ad_placement_id === row.ad_placement_id &&
        s.promotion_version_id === row.promotion_version_id,
    );
    if (match.length === 0) return null;
    return match.reduce((acc, s) => acc + s.selected_slots, 0);
  };

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
                  key={`${row.placement_type}-${row.ad_placement_id ?? row.promotion_version_id ?? row.rule_version ?? "none"}`}
                  row={row}
                  subject={subjectOf(row, subjectNames)}
                  slots={slotsOf(row)}
                />
              ))}
            </tbody>
          </table>
          <p className="border-t border-[var(--line)] p-3 text-xs text-[var(--muted)]">
            種別ごとの購入を足し合わせないでください。同じ購入を二重に数えることがあります（common-spec 9.1.1）。
            全体の購入件数・金額は上のタイル（注文から集計）を見てください。
          </p>
        </div>
      )}
    </section>
  );
}

function AppRow({
  row,
  subject,
  slots,
}: {
  row: AppMetricRow;
  subject: string;
  slots: number | null;
}) {
  const small = row.small_sample === true;

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
      <Td align="right">{slots === null ? "—" : slots}</Td>
      <NumCell value={row.impressions} bold />
      <NumCell value={row.shown_visits} />
      <RateCell numerator={row.clicks} denominator={row.impressions} small={small} />
      <RateCell numerator={row.recommendation_adds} denominator={row.impressions} small={small} />
      <NumCell value={row.recommendation_removes} />
      <RateCell numerator={row.purchases} denominator={row.impressions} small={small} />
      <Td align="right">
        {row.purchase_amount === null ? (
          <Undisclosed />
        ) : (
          formatYen(row.purchase_amount)
        )}
      </Td>
    </tr>
  );
}

/** 数値セル。null は「非公開」（公開範囲の外） */
function NumCell({ value, bold = false }: { value: number | null; bold?: boolean }) {
  return (
    <Td align="right" className={bold ? "font-bold" : undefined}>
      {value === null ? <Undisclosed /> : value.toLocaleString("ja-JP")}
    </Td>
  );
}

/**
 * 率の表示。
 * - いずれかが null なら「非公開」
 * - 分母0は 0% ではなく「—」（common-spec 9.1.1）
 * - DB が small_sample を返したら「参考」注記（D-10）
 */
function RateCell({
  numerator,
  denominator,
  small,
}: {
  numerator: number | null;
  denominator: number | null;
  small: boolean;
}) {
  if (numerator === null || denominator === null) {
    return (
      <Td align="right">
        <Undisclosed />
      </Td>
    );
  }
  const value = rate(numerator, denominator);
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
        <span className="ml-1 text-xs text-[var(--muted)]" title="表示来店数が5未満のため参考値です">
          参考
        </span>
      ) : null}
    </Td>
  );
}

function Undisclosed() {
  return (
    <span className="text-[var(--muted)]" title="公開範囲に含まれていません">
      非公開
    </span>
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
                  key={`${row.hour_start}-${row.ad_placement_id ?? row.promotion_version_id}`}
                  className="border-b border-[var(--line)] last:border-0"
                >
                  <Td className="whitespace-nowrap">
                    {new Date(row.hour_start).toLocaleTimeString("ja-JP", {
                      timeZone: "Asia/Tokyo",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    台
                  </Td>
                  <Td className="whitespace-nowrap">{placementTypeLabel[signagePlacementType(row)]}</Td>
                  <Td className="text-[var(--muted)]">{subjectOf(row, subjectNames)}</Td>
                  <Td align="right">{row.plays === null ? <Undisclosed /> : `${row.plays}回`}</Td>
                  <Td align="right">
                    {row.play_seconds === null ? <Undisclosed /> : `${row.play_seconds}秒`}
                  </Td>
                  <Td align="right">
                    <ViewerCell row={row} />
                  </Td>
                  <Td align="right">
                    {row.reference_sales_quantity === null ? (
                      <Undisclosed />
                    ) : (
                      row.reference_sales_quantity
                    )}
                  </Td>
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

/** 計測できた再生が無ければ「未計測」。0人と区別する（common-spec 9.4） */
function ViewerCell({ row }: { row: SignageMetricRow }) {
  if (row.measured_plays === null) return <Undisclosed />;
  if (row.measured_plays === 0) {
    const error = row.error_plays ?? 0;
    return (
      <span className="text-[var(--muted)]">
        未計測
        {error > 0 ? `（うち失敗${error}件）` : ""}
      </span>
    );
  }
  return (
    <>
      {(row.estimated_viewers ?? 0).toLocaleString("ja-JP")}人
      <span className="ml-1 text-xs text-[var(--muted)]">／{row.measured_plays}件</span>
    </>
  );
}

/* ------------------------------------------------------------------ */

function OrderTotalsTile({ totals }: { totals: OrderTotals[] }) {
  const operated = totals.find((t) => t.data_origin === "operated");
  const others = totals.filter((t) => t.data_origin !== "operated");

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
      <p className="text-sm text-[var(--muted)]">購入（注文から集計）</p>
      <p className="mt-1">
        <span className="text-3xl font-bold">{operated ? operated.orders : 0}</span>
        <span className="ml-1 text-sm text-[var(--muted)]">
          件 / {formatYen(operated ? operated.amount : 0)}
        </span>
      </p>
      <p className="mt-2 text-xs text-[var(--muted)]">
        種別別の値を足さず、注文から直接集計した値です（common-spec 9.1.1）
      </p>
      {/* 由来の違うデータは、合算せずに別の行として出す（D-03） */}
      {others.map((other) => (
        <p key={other.data_origin} className="mt-1 text-xs text-[var(--muted)]">
          別の由来：{dataOriginLabel[other.data_origin]} {other.orders}件 /{" "}
          {formatYen(other.amount)}（上の数値と足さないでください）
        </p>
      ))}
    </div>
  );
}

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

/**
 * 合計。3つの状態を区別する。
 *   "none" … 行が1件も無い（対象なし）
 *   null   … 行はあるが、すべて公開範囲の外で DB が null を返した
 *   数値   … 合計
 * 両者を混ぜると、記録が無いだけなのに「非公開」と出てしまう。
 */
function sum(values: (number | null)[]): number | null | "none" {
  if (values.length === 0) return "none";
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0);
}

function fmt(value: number | null | "none"): string {
  if (value === "none") return "—";
  return value === null ? "非公開" : value.toLocaleString("ja-JP");
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
