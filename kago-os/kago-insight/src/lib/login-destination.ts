/** 戻り先はInsightの画面だけ。フォームのhidden値も信用せず再検証する。 */
const screens = new Set(["/analysis", "/promotions", "/review", "/coupons", "/metrics", "/signage-decisions"]);
const fallback = "/promotions";

export function loginDestination(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/")
    || /[\\\u0000-\u0020\u007f]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://insight.invalid");
    if (url.origin !== "https://insight.invalid") return fallback;
    // NextのredirectがbasePathを付けるため、公開URLの二重付与を避ける。
    const path = url.pathname.startsWith("/insight/")
      ? url.pathname.slice("/insight".length) : url.pathname;
    if (!screens.has(path)) return fallback;
    return path + url.search + url.hash;
  } catch {
    return fallback;
  }
}
