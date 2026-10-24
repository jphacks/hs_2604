import assert from "node:assert/strict";
import { test } from "node:test";
import { newSuggestionItemIds } from "../src/features/recommendations/new-suggestions.ts";
import type { SavedSelection, SavedSelectionItem } from "../src/features/recommendations/selection-contracts.ts";

const item = (productId: string, patch: Partial<SavedSelectionItem> = {}): SavedSelectionItem => ({
  selectionItemId: `slot-${productId}`, slot: 1, rank: 1, placementType: "organic", reasonCode: "co_purchase", reasonText: "一緒に使えます",
  product: { productId, code: productId, name: productId, category: "食品", price: 100 },
  adPlacementId: null, promotionVersionId: null, sponsor: null, evidence: {}, ...patch,
});
const selection = (items: SavedSelectionItem[], patch: Partial<SavedSelection> = {}): SavedSelection => ({
  selectionId: "selection", visitId: "visit", cartVersion: 0, ruleVersion: 1, items, ...patch,
});
const ad = item("sauce", { placementType: "sponsored", reasonCode: "sponsored_related", adPlacementId: "placement-1",
  sponsor: { makerName: "架空メーカー", headline: "広告", creativeVersionId: "creative-1" } });
const promo = item("apple", { placementType: "store_promo", reasonCode: "store_pick", promotionVersionId: "promo-1" });

test("initial results and another visit are baselines, including all placement types", () => {
  const next = selection([item("milk"), ad, promo]);
  assert.deepEqual(newSuggestionItemIds(null, next), []);
  assert.deepEqual(newSuggestionItemIds(selection([]), { ...next, visitId: "another" }), []);
});
test("new products are marked for organic, store and sponsored cards while unchanged cards are not", () => {
  const before = selection([item("milk")]);
  const next = selection([item("milk", { selectionItemId: "milk-new-id" }), item("bread"), ad, promo]);
  assert.deepEqual(newSuggestionItemIds(before, next), ["slot-bread", "slot-sauce", "slot-apple"]);
});
test("new selection/item IDs, ranking, cart version, reason and current price do not make the same content NEW", () => {
  const before = selection([item("milk"), ad, promo]);
  const next = selection([...before.items].reverse().map((value, i) => ({ ...value, selectionItemId: `new-${i}`, rank: i + 1,
    slot: i + 1, reasonText: "理由の更新", product: { ...value.product, price: 150 } })), { selectionId: "new-selection", cartVersion: 2 });
  assert.deepEqual(newSuggestionItemIds(before, next), []);
});
test("a new approved ad placement or creative is NEW even for the same product", () => {
  const before = selection([ad]);
  assert.deepEqual(newSuggestionItemIds(before, selection([{ ...ad, adPlacementId: "placement-2" }])), [ad.selectionItemId]);
  assert.deepEqual(newSuggestionItemIds(before, selection([{ ...ad, sponsor: { ...ad.sponsor!, creativeVersionId: "creative-2" } }])), [ad.selectionItemId]);
});
test("a new store promotion version is NEW even for the same product", () => {
  assert.deepEqual(newSuggestionItemIds(selection([promo]), selection([{ ...promo, promotionVersionId: "promo-2" }])), [promo.selectionItemId]);
});
test("changing a product from organic to sponsored or store promotion is new content", () => {
  assert.deepEqual(newSuggestionItemIds(selection([item("sauce"), item("apple")]), selection([ad, promo])), [ad.selectionItemId, promo.selectionItemId]);
});
test("a removed card adds no badge; a card appearing after an accepted empty result is NEW", () => {
  assert.deepEqual(newSuggestionItemIds(selection([ad]), selection([])), []);
  assert.deepEqual(newSuggestionItemIds(selection([]), selection([ad])), [ad.selectionItemId]);
});
