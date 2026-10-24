import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { relatedProducts, type AssociationRuleSet } from "../src/features/recommendations/association.ts";
import { mine, parseBaskets } from "../../../analysis/app04-association-rules/mine-rules.mjs";

const rules = JSON.parse(await readFile(new URL("../src/features/recommendations/association-rules.json", import.meta.url), "utf8")) as AssociationRuleSet & { source: { sha256: string } };
const PASTA = "2900000000100", SAUCE = "2900000000162", BASIL = "2900000000179", MILK = "2900000000049", EGG = "2900000000063", BREAD = "2900000000056";

test("bundled rule set records its version, source and both rule origins", () => {
  assert.equal(rules.version, 2);
  assert.equal(rules.source.sha256, "7a0e3408c631b5e3fe69af035a1209ffaf22b43b4af16218c5d5d23e761e6164");
  assert(rules.rules.length > 0 && rules.rules.every(rule => rule.origin === "analysis" && rule.from !== rule.to && (rule.lift ?? 0) >= 1.2));
  assert(rules.initialRules.length > 0 && rules.initialRules.every(rule => rule.origin === "initial"));
});
test("pasta cart: curated sauce/basil first, then analysis candidates; nothing already in the cart", () => {
  const result = relatedProducts(rules, [PASTA], { limit: 5 });
  assert.deepEqual(result.slice(0, 2).map(c => c.code).sort(), [BASIL, SAUCE].sort());
  assert(result.slice(2).every(c => c.origin === "analysis"));
  assert(!result.some(c => c.code === PASTA));
  assert(result.every(c => c.ruleVersion === 2 && c.triggeredBy === PASTA && c.reason.length > 0));
  assert.deepEqual(relatedProducts(rules, [PASTA, SAUCE]).map(c => c.code).includes(SAUCE), false);
});
test("initial and analysis rules can be selected separately", () => {
  assert(relatedProducts(rules, [PASTA], { origins: ["initial"] }).every(c => c.origin === "initial"));
  const analysis = relatedProducts(rules, [PASTA], { origins: ["analysis"] });
  assert(analysis.length > 0 && analysis.every(c => c.origin === "analysis"));
  assert(!analysis.some(c => c.code === SAUCE), "public data has no pasta→sauce rule; only the curated rule suggests it");
});
test("ranking by confidence vs lift is deterministic", () => {
  const byConfidence = relatedProducts(rules, [EGG], { origins: ["analysis"], rankBy: "confidence" });
  assert.equal(byConfidence[0].code, MILK);
  const byLift = relatedProducts(rules, [EGG], { origins: ["analysis"], rankBy: "lift" });
  assert(byLift[0].score >= byLift.at(-1)!.score);
  assert.deepEqual(relatedProducts(rules, [EGG, BREAD]), relatedProducts(rules, [BREAD, EGG]));
});
test("empty cart, unknown products and exclusions return no misleading candidates", () => {
  assert.deepEqual(relatedProducts(rules, []), []);
  assert.deepEqual(relatedProducts(rules, ["0000000000000"]), []);
  assert(!relatedProducts(rules, [PASTA], { exclude: [SAUCE] }).some(c => c.code === SAUCE));
});
test("the mining script reproduces support, confidence, lift and holdout filtering", () => {
  const train = ["a|b", "a|b", "a|c", "b", "x"], held = "a|b";
  const baskets = parseBaskets([...train.slice(0, 4), held, train[4], "a|b", "a|b", "c", held].join("\n"));
  const map = [{ code: "A", name: "商品A 1個", groceriesItem: "a" }, { code: "B", name: "商品B", groceriesItem: "b" }, { code: "C", name: "商品C", groceriesItem: "c" }];
  const result = mine(baskets, map, { holdoutEvery: 5, minTrainCount: 2, minTrainLift: 1.0, minTestCount: 1, minTestLift: 1.0, maxRulesPerProduct: 4 });
  const ab = result.categoryRules.find((r: { from: string; to: string }) => r.from === "a" && r.to === "b")!;
  assert.equal(ab.train.count, 4); assert.equal(ab.train.confidence, 0.8);
  assert(Math.abs(ab.train.lift - 0.8 / (5 / 8)) < 1e-9);
  assert.equal(result.rules.find((r: { from: string }) => r.from === "A").reason, "商品Aと一緒に選ばれています");
  assert(!result.categoryRules.some((r: { from: string; to: string }) => r.from === "a" && r.to === "c"), "a→c never co-occurs in the held-out baskets");
});
test("v2 (#150): fresh products get rules from the public data, and the v1 rules the demo uses are kept", async () => {
  const fresh = (code: string) => /^PLU-[456]/.test(code);
  // Rules between the original demo products are chosen separately, so the demo (pasta → eggs etc.) is unchanged.
  assert(rules.rules.some(r => r.id === `grc-${PASTA}-${EGG}` && r.lift === 1.358));
  const pork = relatedProducts(rules, ["PLU-5002"], { rankBy: "confidence", limit: 3 });
  assert(pork.length === 3 && pork.every(c => c.origin === "analysis"));
  assert(pork.some(c => fresh(c.code)), "pork suggests fresh vegetables");
  assert(relatedProducts(rules, [MILK], { rankBy: "confidence", limit: 5 }).some(c => fresh(c.code)));
  assert(rules.rules.filter(r => fresh(r.from) || fresh(r.to)).every(r => r.reason.endsWith("と一緒に選ばれています")));
  // Fish has too few baskets in Groceries (accepted for the hackathon): no rules either way.
  assert.equal(rules.rules.filter(r => r.from.startsWith("PLU-6") || r.to.startsWith("PLU-6")).length, 0);
});
