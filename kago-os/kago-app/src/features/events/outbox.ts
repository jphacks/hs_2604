import type { AppEvent } from "./contracts.ts";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
// One queue per user/tab. The original envelope survives reloads and visit switches.
export class EventOutbox {
  private pending: AppEvent[] = [];
  private sending = false;
  private seen = new Set<string>();
  private key: string;
  private storage: Storage;
  private send: (event: AppEvent) => Promise<number>;
  constructor(key: string, storage: Storage, send: (event: AppEvent) => Promise<number>) {
    this.key = key; this.storage = storage; this.send = send;
    try {
      const rows = JSON.parse(storage.getItem(key) ?? "[]");
      if (Array.isArray(rows)) this.pending = rows.filter((row): row is AppEvent => !!row && typeof row.event_id === "string" && typeof row.visit_id === "string");
    } catch { /* Storage may be disabled; keep this session's events in memory. */ }
    for (const row of this.pending) if (row.event_type === "recommendation_impression") this.seen.add(row.selection_item_id);
  }
  private persist() {
    try { this.storage.setItem(this.key, JSON.stringify(this.pending)); } catch { /* Analytics must never block shopping. */ }
  }
  enqueue(event: AppEvent) {
    if (event.event_type === "recommendation_impression") {
      if (this.seen.has(event.selection_item_id)) return;
      this.seen.add(event.selection_item_id);
    }
    this.pending.push(event);
    this.persist();
  }
  async flush() {
    if (this.sending) return;
    this.sending = true;
    try {
      for (let count = 0; this.pending.length && count < 50; count++) {
        let status: number;
        try { status = await this.send(this.pending[0]); } catch { break; }
        // Retry transport/server/auth failures with the original id and timestamp.
        // Invalid/forbidden records are terminal, so one bad record cannot block the queue.
        if (!(status >= 200 && status < 300) && ![400, 403, 409, 422].includes(status)) break;
        this.pending.shift(); this.persist();
      }
    } finally { this.sending = false; }
  }
}
