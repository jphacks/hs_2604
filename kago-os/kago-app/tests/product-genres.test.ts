// #144: the App menu lists only 野菜・肉・魚, decided by the product category (plus DATA-01 vegetables by code).
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PRODUCT_GENRES, productGenre, productsInGenre } from "../src/lib/product-genres.ts";

const seed = await readFile(new URL("../../kago-core/supabase/seed/app_menu_fresh_products.sql", import.meta.url), "utf8");
const seeded = [...seed.matchAll(/\(\s*\d+, '([^']+)', '([^']+)',\s*'([^']+)',/g)].map(m => ({ code: m[1], name: m[2], category: m[3] }));

test("three genres in order: 野菜, 肉, 魚", () => {
  assert.deepEqual(PRODUCT_GENRES.map(g => g.label), ["野菜", "肉", "魚"]);
});
test("seeded fresh products fall into their genre (9 each)", () => {
  assert.equal(seeded.length, 27);
  for (const genre of ["vegetable", "meat", "fish"] as const) assert.equal(productsInGenre(seeded, genre).length, 9);
  assert.equal(productGenre({ code: "PLU-4001", category: "野菜" }), "vegetable");
  assert.equal(productGenre({ code: "PLU-5004", category: "肉" }), "meat");
  assert.equal(productGenre({ code: "PLU-6001", category: "魚" }), "fish");
});
test("DATA-01 vegetables (玉ねぎ・アボカド・生バジル) are 野菜 without changing their 青果 category; fruit and others are hidden", () => {
  for (const code of ["PLU-1001", "PLU-1003", "2900000000179"]) assert.equal(productGenre({ code, category: "青果" }), "vegetable");
  for (const [code, category] of [["PLU-1002", "青果"], ["2900000000087", "青果"], ["2900000000100", "乾麺"], ["2900000000162", "調味料"],
    ["2900000000049", "乳製品"], ["PLU-2002", "惣菜"], ["2900000000018", "飲料"]]) assert.equal(productGenre({ code, category }), null, code);
});
