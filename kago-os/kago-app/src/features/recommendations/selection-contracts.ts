// APP-05: selection of up to 3 suggestion slots (organic / store_promo / sponsored).
export type PlacementType = "organic" | "store_promo" | "sponsored";
export type ReasonCode = "co_purchase" | "replenishment" | "popular" | "store_pick" | "sponsored_related";
export type Listing = { productId: string; code: string; name: string; category: string; price: number };
export type CandidatePromotion = { promotionVersionId: string; promotionId: string; version: number; productId: string;
  priority: number; reasonText: string; startsAt: string; endsAt: string };
export type CandidateAd = { adPlacementId: string; creativeVersionId: string; creativeVersion: number; productId: string;
  headline: string; makerName: string; startsAt: string; endsAt: string };
// app_selection_candidates (DB): what is deliverable for the visit right now.
export type SelectionCandidates = {
  visit: { id: string; store_id: string; cart_version: number; started_at: string; experiment_arm: string | null };
  at: string;
  cart: { productId: string; code: string }[];
  listings: Listing[];
  promotions: CandidatePromotion[];
  ads: CandidateAd[];
  popular: { productId: string; orders: number }[];
};
export type SelectionItem = {
  slot: number; rank: number; placementType: PlacementType; reasonCode: ReasonCode; reasonText: string;
  product: Listing;
  adPlacementId: string | null; promotionVersionId: string | null;
  sponsor: { makerName: string; headline: string; creativeVersionId: string } | null;
  // Why it was chosen (not saved; for tests / debugging and APP-06 wording).
  evidence: { ruleId?: string; ruleOrigin?: "initial" | "analysis"; triggeredBy?: string; promotionPriority?: number; orders?: number; cycleRatio?: number };
};
export type Selection = { visitId: string; cartVersion: number; ruleVersion: number; items: SelectionItem[] };
// API response: the saved selection with DB ids (APP-06 shows it, APP-07 logs events against selectionItemId).
export type SavedSelectionItem = SelectionItem & { selectionItemId: string };
export type SavedSelection = Omit<Selection, "items"> & { selectionId: string | null; items: SavedSelectionItem[] };
