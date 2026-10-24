// Short product name for reason texts and stickers (#137).
// The first word, plus the second when the first is a Latin-letter brand ("KAGO 緑茶 500ml" → "KAGO 緑茶").
// Size/pack words are dropped as before ("スパゲッティ 500g" → "スパゲッティ", "液体洗濯洗剤 詰替" → "液体洗濯洗剤").
// Keep in sync with analysis/app04-association-rules/mine-rules.mjs (shortProductName).
export function shortProductName(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.slice(0, /^[A-Za-z][A-Za-z0-9&.'-]*$/.test(words[0]) && words.length > 1 ? 2 : 1).join(" ");
}
