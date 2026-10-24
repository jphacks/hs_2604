// Browser-owned events only. Scan/cart writes already emit events atomically in APP-02.
export type EventAction =
  | { event_type: "recommendation_impression"; selection_item_id: string; product_id: string; payload: { visible_ms: number } }
  | { event_type: "recommendation_click"; selection_item_id: string; product_id: string; payload: { target: "detail" | "add_button" } }
  | { event_type: "product_compared"; selection_item_id: null; product_id: null; payload: { product_ids: string[] } };
export type AppEvent = EventAction & {
  event_id: string; schema_version: 1; occurred_at: string; channel: "app";
  user_id: string; store_id: string; visit_id: string; data_origin: "operated";
};
