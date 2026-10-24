import type { SavedSelection } from "./selection-contracts.ts";

export const RECOMMENDATION_DEBOUNCE_MS = 250;
export type RecommendationScope = { visitId: string; cartVersion: number };
export type RecommendationState =
  | { status: "loading"; scope: RecommendationScope | null }
  | { status: "error"; scope: RecommendationScope; message: string }
  | { status: "ready"; scope: RecommendationScope; data: SavedSelection };

export function sameRecommendationScope(a: RecommendationScope | null | undefined, b: RecommendationScope | null) {
  return a?.visitId === b?.visitId && a?.cartVersion === b?.cartVersion;
}

// Only selection requests are debounced. Cart mutations continue to save individually in APP-02.
export class RecommendationRefresh {
  private scope: RecommendationScope | null = null;
  private serial = 0;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private request: AbortController | null = null;
  private options: {
    load: (signal: AbortSignal) => Promise<SavedSelection>;
    publish: (state: RecommendationState) => void;
    reloadCart: () => void;
    revalidateSession: () => void;
    debounceMs?: number;
  };
  constructor(options: RecommendationRefresh["options"]) { this.options = options; }
  update(scope: RecommendationScope | null) {
    if (this.stopped || sameRecommendationScope(this.scope, scope)) return;
    this.scope = scope;
    this.cancel();
    this.options.publish({ status: "loading", scope });
    if (scope) this.start(scope, this.options.debounceMs ?? RECOMMENDATION_DEBOUNCE_MS, 0);
  }
  retry() {
    if (!this.stopped && this.scope) this.start(this.scope, 0, 0);
  }
  private cancel() {
    ++this.serial;
    clearTimeout(this.timer); this.timer = undefined;
    this.request?.abort(); this.request = null;
  }
  private start(scope: RecommendationScope, delay: number, retry: number) {
    this.cancel();
    const serial = this.serial;
    const controller = new AbortController(); this.request = controller;
    this.options.publish({ status: "loading", scope });
    this.timer = setTimeout(() => { void this.load(scope, serial, controller, retry); }, delay);
  }
  private async load(scope: RecommendationScope, serial: number, controller: AbortController, retry: number) {
    const current = () => !this.stopped && !controller.signal.aborted && serial === this.serial && sameRecommendationScope(this.scope, scope);
    try {
      const data = await this.options.load(controller.signal);
      if (!current()) return;
      if (data.visitId !== scope.visitId) {
        this.options.revalidateSession();
        this.fail(scope); return;
      }
      if (data.cartVersion !== scope.cartVersion) {
        this.changed(scope, retry); return;
      }
      this.options.publish({ status: "ready", scope, data });
    } catch (failure) {
      if (!current()) return;
      const code = (failure as { code?: string })?.code;
      if (code === "input_changed") { this.changed(scope, retry); return; }
      if (code === "unauthenticated" || code === "session_expired") this.options.revalidateSession();
      this.fail(scope);
    }
  }
  private changed(scope: RecommendationScope, retry: number) {
    // Another tab may have advanced the DB beyond this browser's cart snapshot.
    // Bound retries so a failed cart reload never leaves a permanent spinner or a hot loop.
    const serial = this.serial;
    this.options.reloadCart();
    if (this.stopped || serial !== this.serial || !sameRecommendationScope(this.scope, scope)) return;
    if (retry === 0) this.start(scope, this.options.debounceMs ?? RECOMMENDATION_DEBOUNCE_MS, 1);
    else this.fail(scope);
  }
  private fail(scope: RecommendationScope) {
    if (this.stopped || !sameRecommendationScope(this.scope, scope)) return;
    this.options.publish({ status: "error", scope, message: "おすすめを読み込めませんでした。通信状態を確認して再試行してください。" });
  }
  stop() { this.stopped = true; this.cancel(); }
}
