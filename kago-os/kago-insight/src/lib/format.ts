/**
 * 率の計算と表示。common-spec.md 9.1.1・9.4 に従う。
 * - 分母が0の率は 0% ではなく「対象なし（—）」とする
 * - 表示来店数が5未満の率には「少数のため参考値」を付ける
 */

export const SMALL_SAMPLE_THRESHOLD = 5; // D-10 / Q-05（採用案）

export function rate(numerator: number, denominator: number): number | null {
  if (!denominator) return null; // 対象なし
  return numerator / denominator;
}

export function formatRate(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 1000) / 10}%`;
}

export function isSmallSample(impressionVisits: number): boolean {
  return impressionVisits < SMALL_SAMPLE_THRESHOLD;
}

export function formatYen(value: number): string {
  return `${value.toLocaleString("ja-JP")}円`;
}

/** 未計測は 0 と区別する（9.4） */
export function formatCountOrUnmeasured(value: number | null): string {
  return value === null ? "未計測" : value.toLocaleString("ja-JP");
}

/** 表示・時間帯集計は Asia/Tokyo（common-spec.md D-09） */
const TZ = "Asia/Tokyo";

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: TZ,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** <input type="date"> に渡す yyyy-mm-dd（Asia/Tokyo基準） */
export function toDateInputValue(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
  return parts;
}
