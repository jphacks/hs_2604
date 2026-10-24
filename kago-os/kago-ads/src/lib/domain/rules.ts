// 募集・申請・配信の判定ルール（画面にもデータ層にも依存しない純粋な関数）
// 状態の名前と遷移は共通仕様書 6 章に合わせる
import type {
  AdApplication,
  AdCall,
  AdPlacement,
  ApplicationRevision,
  Channel,
  CreativeVersion,
  Timestamp,
} from "./types";

const TZ = "Asia/Tokyo";

/** 今日の日付（YYYY-MM-DD、日本時間） */
export function today(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(now);
}

/** 時刻の日本時間の日付（YYYY-MM-DD）。画面の日付入力と表示に使う */
export function dateOf(ts: Timestamp): string {
  return today(new Date(ts));
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 期間は [starts_at, ends_at)（docs/specs/database-design.md）。日付で入力した期間は、
 * 始まりをその日の0時、終わりを最終日の翌日0時にする（日本時間）
 */
export const dayStart = (date: string): Timestamp => `${date}T00:00:00+09:00`;
export const dayEnd = (date: string): Timestamp => `${addDays(date, 1)}T00:00:00+09:00`;

const ms = (ts: Timestamp) => Date.parse(ts);

/** 期間の最終日（終わりの時刻は含まないので、その直前の日付）。表示と日付の入力欄に使う */
export function endDateOf(end: Timestamp): string {
  return today(new Date(ms(end) - 1));
}

/** 表示用の期間（日本時間の日付。終わりは最終日） */
export function periodLabel(start: Timestamp, end: Timestamp): string {
  return `${dateOf(start)}〜${endDateOf(end)}`;
}

export type CallPhase = "draft" | "upcoming" | "open" | "ended" | "closed";

export const PHASE_LABEL: Record<CallPhase, string> = {
  draft: "下書き",
  upcoming: "公開中（開始前）",
  open: "募集中",
  ended: "期間終了",
  closed: "募集終了",
};

/** 募集の状態と期間から、今の段階を決める */
export function callPhase(c: AdCall, now: Date = new Date()): CallPhase {
  if (c.status === "draft") return "draft";
  if (c.status === "closed") return "closed";
  if (now.getTime() >= ms(c.ends_at)) return "ended";
  if (now.getTime() < ms(c.starts_at)) return "upcoming";
  return "open";
}

/** 新しく申請できる募集か（共通仕様書 6：closed 後は新規申請を受け付けない） */
export function canApplyTo(c: AdCall, now: Date = new Date()): boolean {
  const phase = callPhase(c, now);
  return phase === "open" || phase === "upcoming";
}

/** 募集の入力チェック（ADS-02） */
export function validateAdCall(input: {
  title: string;
  categories: string[];
  starts_at: Timestamp;
  ends_at: Timestamp;
  channels: Channel[];
  description: string;
}): string[] {
  const errors: string[] = [];
  if (!input.title.trim()) errors.push("募集名を入力してください");
  if (input.categories.length === 0) errors.push("対象カテゴリを1つ以上選んでください");
  if (!input.starts_at || !input.ends_at) errors.push("掲載期間を入力してください");
  else if (ms(input.starts_at) >= ms(input.ends_at)) errors.push("掲載期間の終わりは始まり以降にしてください");
  if (input.channels.length === 0) errors.push("掲載先（App・Signage）を1つ以上選んでください");
  if (!input.description.trim()) errors.push("案内文を入力してください");
  return errors;
}

/** 申請の入力チェック（ADS-03） */
export function validateApplication(
  call: AdCall,
  version: CreativeVersion,
  input: { requested_start: Timestamp; requested_end: Timestamp; channels: Channel[] },
  now: Date = new Date(),
): string[] {
  const errors: string[] = [];
  if (!canApplyTo(call, now)) errors.push("この募集は終了しているため申請できません");
  if (input.channels.length === 0) errors.push("掲載先を1つ以上選んでください");
  for (const ch of input.channels) {
    const label = ch === "app" ? "App" : "Signage";
    if (!call.channels.includes(ch)) errors.push(`この募集は ${label} を募集していません`);
    else if (!version.assets[ch]) errors.push(`選んだ版に ${label} 用の素材がありません`);
  }
  if (!input.requested_start || !input.requested_end) errors.push("希望期間を入力してください");
  else {
    if (ms(input.requested_start) >= ms(input.requested_end)) errors.push("希望期間の終わりは始まり以降にしてください");
    if (ms(input.requested_start) < ms(call.starts_at) || ms(input.requested_end) > ms(call.ends_at)) {
      errors.push(`希望期間は募集の掲載期間（${periodLabel(call.starts_at, call.ends_at)}）の中にしてください`);
    }
  }
  return errors;
}

/** 却下・停止の理由（必須・200字以内。Insight のデータ項目表の未決 #3 への回答） */
export const REVIEW_COMMENT_MAX = 200;
export function validateReviewComment(comment: string): string[] {
  const c = comment.trim();
  if (!c) return ["理由を入力してください"];
  if (c.length > REVIEW_COMMENT_MAX) return [`理由は${REVIEW_COMMENT_MAX}字以内にしてください（今は${c.length}字）`];
  return [];
}

/** 承認するときに絞る掲載先は、申請した掲載先の一部（1つ以上） */
export function validateApprovalChannels(requested: Channel[], approved: Channel[]): string[] {
  if (approved.length === 0) return ["承認する掲載先を1つ以上選んでください"];
  if (approved.some((c) => !requested.includes(c))) return ["申請されていない掲載先は承認できません"];
  return [];
}

export function latestRevision(app: AdApplication): ApplicationRevision {
  return app.revisions[app.revisions.length - 1];
}

/** 再申請できるか。審査中（submitted）の間はできない。却下後の修正と、承認後の素材差し替えはできる */
export function canResubmit(app: AdApplication): boolean {
  return app.status !== "submitted";
}

export type DeliveryState = "delivering" | "scheduled" | "ended" | "suspended" | "none";

export const DELIVERY_LABEL: Record<DeliveryState, string> = {
  delivering: "配信中",
  scheduled: "配信待ち",
  ended: "配信期間終了",
  suspended: "停止中",
  none: "配信なし",
};

/**
 * 掲載先ごとの配信の状態。配信対象（ad_placements）から決める。
 * 新しい版を承認するまで旧版の配信対象は active のまま（共通仕様書 6：承認で旧版は superseded）。
 */
export function deliveryState(
  placements: AdPlacement[],
  channel: Channel,
  now: Date = new Date(),
): { state: DeliveryState; placement?: AdPlacement } {
  const mine = placements.filter((p) => p.channels.includes(channel) && p.status !== "superseded");
  const active = mine.find((p) => p.status === "active");
  if (active) {
    if (now.getTime() < ms(active.starts_at)) return { state: "scheduled", placement: active };
    if (now.getTime() >= ms(active.ends_at)) return { state: "ended", placement: active };
    return { state: "delivering", placement: active };
  }
  const suspended = mine.find((p) => p.status === "suspended");
  if (suspended) return { state: "suspended", placement: suspended };
  return { state: "none" };
}

/** 募集ポータルの絞り込み（ADS-01） */
export type PortalFilter = {
  keyword: string;
  category: string;
  channel: Channel | "";
  storeId: string;
  /** この日（YYYY-MM-DD）に掲載できる募集だけ（空なら絞らない） */
  date: string;
  includeEnded: boolean;
};

export function filterAdCalls(list: AdCall[], f: PortalFilter, now: Date = new Date()): AdCall[] {
  const kw = f.keyword.trim();
  return list
    .filter((c) => c.status !== "draft")
    .filter((c) => f.includeEnded || canApplyTo(c, now))
    .filter((c) => !f.category || c.categories.includes(f.category))
    .filter((c) => !f.channel || c.channels.includes(f.channel))
    .filter((c) => !f.storeId || c.store_id === f.storeId)
    .filter((c) => !f.date || (ms(c.starts_at) < ms(dayEnd(f.date)) && ms(dayStart(f.date)) < ms(c.ends_at)))
    .filter((c) => !kw || c.title.includes(kw) || c.description.includes(kw))
    .sort((a, b) => Number(canApplyTo(b, now)) - Number(canApplyTo(a, now)) || ms(a.ends_at) - ms(b.ends_at));
}

/** 店舗の表示名（name と branch_name をつなぐ） */
export function storeLabel(s: { name: string; branch_name: string }): string {
  return s.branch_name ? `${s.name} ${s.branch_name}` : s.name;
}
