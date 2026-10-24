import type { SavedSelection, SavedSelectionItem } from "./selection-contracts.ts";

// Compare content, never the IDs/ranks created for each saved selection.
function contentKey(item: SavedSelectionItem): string {
  return JSON.stringify([item.placementType, item.product.productId,
    item.placementType === "sponsored" ? [item.adPlacementId, item.sponsor?.creativeVersionId] : null,
    item.placementType === "store_promo" ? item.promotionVersionId : null]);
}

export function newSuggestionItemIds(previous: SavedSelection | null, next: SavedSelection): string[] {
  if (!previous || previous.visitId !== next.visitId) return [];
  const before = new Set(previous.items.map(contentKey));
  return next.items.filter(item => !before.has(contentKey(item))).map(item => item.selectionItemId);
}
