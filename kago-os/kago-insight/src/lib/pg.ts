import type { Period } from "./types";

/**
 * PostgreSQL の tstzrange を画面用に分解する。
 * PostgREST は '["2026-10-24 00:00:00+00","2026-10-25 00:00:00+00")' のような文字列で返す。
 * 仕様上 requested_period は常に [start, end) なので、境界記号は読み飛ばす。
 */
export function parseRange(value: string): Period {
  const inner = value.slice(1, -1);
  const comma = inner.indexOf(",");
  const unquote = (part: string) => part.trim().replace(/^"|"$/g, "");
  return {
    starts_at: toIso(unquote(inner.slice(0, comma))),
    ends_at: toIso(unquote(inner.slice(comma + 1))),
  };
}

/**
 * '2026-10-24 00:00:00+00' を ISO 8601 に直す。
 * PostgreSQL は時差を +00 と2桁で返すことがあり、そのままでは Date が解釈できない。
 */
export function toIso(value: string): string {
  const normalized = value
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error(`時刻として読めません: ${value}`);
  return date.toISOString();
}

/** 数値列。DB が null（公開範囲外）を返す場合があるので null を潰さない */
export function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** id をキーにした索引を作る。関連テーブルを別クエリで引いてJSで突き合わせるため */
export function indexBy<T, K extends keyof T>(rows: T[], key: K): Map<T[K], T> {
  return new Map(rows.map((row) => [row[key], row]));
}

/** null と重複を除いた id の配列。.in() に渡す */
export function uniqueIds(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
