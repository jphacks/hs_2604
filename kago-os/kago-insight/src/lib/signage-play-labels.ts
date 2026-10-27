export function playReasonLabel(code: string): string {
 const labels: Record<string,string> = {
  approved_order: "承認された順に広告を表示", store_pick: "店舗のおすすめを表示",
  no_content: "配信できる広告がないため案内を表示", cache_expired: "保存した配信情報の期限切れ",
  media_unavailable: "素材を取得できないため案内を表示",
  crowd_category: "店内の集計傾向に応じた選定", crowd_small: "少人数のため汎用案内",
  crowd_missing: "集計がないため汎用案内", crowd_invalid: "集計を利用できないため汎用案内",
  crowd_expired: "集計の期限切れのため汎用案内", crowd_no_match: "条件に合う広告がないため汎用案内",
  crowd_no_content: "有効な広告がないため汎用案内",
 };
 return Object.hasOwn(labels,code) ? labels[code] : "未分類の選定理由";
}
export function playEndLabel(code: string): string {
 const labels: Record<string,string> = {completed:"表示完了",updated:"内容更新",suspended:"配信停止",expired:"掲載期限切れ",media_error:"素材の読込失敗",closed:"画面を閉じた"};
 return Object.hasOwn(labels,code) ? labels[code] : "未分類の終了理由";
}
export function playOriginLabel(origin: string): string {
 return origin==="operated" ? "通常操作" : origin==="seeded" ? "投入データ" : origin==="synthetic" ? "合成データ" : "不明";
}
