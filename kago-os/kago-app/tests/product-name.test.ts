// #137: short product names keep a Latin-letter brand ("KAGO 緑茶") instead of becoming "KAGO".
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { shortProductName } from "../src/lib/product-name.ts";
import { shortProductName as fromMiner } from "../../../analysis/app04-association-rules/mine-rules.mjs";

const products = JSON.parse(await readFile(new URL("../src/data/demo/products.json", import.meta.url), "utf8")) as { name: string }[];
const rules = JSON.parse(await readFile(new URL("../src/features/recommendations/association-rules.json", import.meta.url), "utf8")) as { rules: { reason: string }[] };

test("brand prefix is kept; size and pack words are dropped as before", () => {
  assert.equal(shortProductName("KAGO 緑茶 500ml"), "KAGO 緑茶");
  assert.equal(shortProductName("KAGO カフェラテ"), "KAGO カフェラテ");
  assert.equal(shortProductName("スパゲッティ 500g"), "スパゲッティ");
  assert.equal(shortProductName("液体洗濯洗剤 詰替"), "液体洗濯洗剤");
  assert.equal(shortProductName("生バジル"), "生バジル");
  assert.equal(shortProductName("KAGO"), "KAGO");
});
test("the App and the rule generator use the same rule for every demo product", () => {
  for (const { name } of products) {
    assert.equal(fromMiner(name), shortProductName(name), name);
    assert.notEqual(shortProductName(name), "KAGO", name);
  }
});
test("no generated reason says just 'KAGO'", () => {
  assert.equal(rules.rules.filter(r => r.reason.startsWith("KAGOと")).length, 0);
});
