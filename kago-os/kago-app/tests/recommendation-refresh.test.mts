import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { RecommendationRefresh, type RecommendationScope, type RecommendationState } from "../src/features/recommendations/refresh.ts";
import type { SavedSelection } from "../src/features/recommendations/selection-contracts.ts";

const scope = (cartVersion = 0, visitId = "visit-a"): RecommendationScope => ({ visitId, cartVersion });
const data = (cartVersion = 0, visitId = "visit-a"): SavedSelection => ({ visitId, cartVersion, selectionId: `selection-${cartVersion}`, ruleVersion: 1, items: [] });
function setup(debounceMs = 0) {
  const states: RecommendationState[] = [], requests: { signal: AbortSignal; resolve: (value: SavedSelection) => void; reject: (error: unknown) => void }[] = [];
  let reloads = 0, revalidations = 0;
  const loader = new RecommendationRefresh({ debounceMs,
    load: signal => new Promise((resolve, reject) => { requests.push({ signal, resolve, reject }); }),
    publish: state => states.push(state), reloadCart: () => { reloads++; }, revalidateSession: () => { revalidations++; },
  });
  return { loader, states, requests, reloads: () => reloads, revalidations: () => revalidations };
}
const tick = () => delay(10);

test("waits for a loaded cart, coalesces only selection requests, and ignores same-version rerenders", async () => {
  const t = setup(25);
  try {
    t.loader.update(null); await tick(); assert.equal(t.requests.length, 0);
    t.loader.update(scope(0)); t.loader.update(scope(1)); t.loader.update(scope(2));
    await delay(40); assert.equal(t.requests.length, 1);
    t.requests[0].resolve(data(2)); await tick();
    assert.deepEqual(t.states.at(-1), {status:"ready",scope:scope(2),data:data(2)});
    t.loader.update(scope(2)); await delay(40); assert.equal(t.requests.length, 1);
  } finally { t.loader.stop(); }
});

test("a saved cart change invalidates old cards immediately and aborted out-of-order results cannot overwrite the latest", async () => {
  const t = setup();
  try {
    t.loader.update(scope()); await tick(); t.requests[0].resolve(data()); await tick();
    t.loader.retry(); await tick(); // same-version request still in flight
    t.loader.update(scope(1));
    assert.equal(t.states.at(-1)?.status, "loading"); assert(t.requests[1].signal.aborted);
    await tick(); t.requests[2].resolve(data(1)); await tick();
    t.requests[1].resolve(data()); await tick(); // transport ignores AbortSignal
    assert.deepEqual(t.states.at(-1), {status:"ready",scope:scope(1),data:data(1)});
  } finally { t.loader.stop(); }
});

test("newest request wins even for the same cart version; obsolete errors do not replace ready data", async () => {
  const t = setup();
  try {
    t.loader.update(scope()); await tick(); t.loader.retry(); await tick();
    t.requests[1].resolve({...data(),selectionId:"newest"}); await tick();
    t.requests[0].reject({code:"session_expired"}); await tick();
    assert.equal(t.revalidations(), 0);
    const state=t.states.at(-1); assert(state?.status === "ready"); assert.equal(state.data.selectionId,"newest");
  } finally { t.loader.stop(); }
});

test("mismatched cart versions reload the cart and retry once; repeated mismatches expose a retry instead of spinning forever", async () => {
  const t=setup();
  try {
    t.loader.update(scope()); await tick(); t.requests[0].resolve(data(3)); await tick();
    assert.equal(t.reloads(),1); assert.equal(t.requests.length,2);
    t.requests[1].resolve(data(3)); await tick();
    assert.equal(t.states.at(-1)?.status,"error"); assert.equal(t.requests.length,2);
    t.loader.update(scope(3)); await tick(); t.requests[2].resolve(data(3)); await tick();
    assert.equal(t.states.at(-1)?.status,"ready");
  } finally {t.loader.stop();}
});

test("input_changed is bounded and manually retryable; visit switches and stops discard old completions", async () => {
  const t=setup();
  t.loader.update(scope()); await tick(); t.requests[0].reject({code:"input_changed"}); await tick();
  t.requests[1].reject({code:"input_changed"}); await tick(); assert.equal(t.states.at(-1)?.status,"error");
  t.loader.retry(); await tick(); t.loader.update(scope(0,"visit-b")); await tick();
  t.requests[3].resolve(data(0,"visit-b")); await tick();
  t.requests[2].resolve(data()); await tick();
  const state=t.states.at(-1); assert(state?.status==="ready"); assert.equal(state.data.visitId,"visit-b");
  t.loader.retry(); await tick(); t.loader.stop(); const length=t.states.length;
  t.requests[4].resolve(data(0,"visit-b")); await tick(); assert.equal(t.states.length,length);
});

test("foreign-visit results and auth failures revalidate the session and never publish recommendation data", async () => {
  for (const failure of [false,true]) {
    const t=setup();
    try {
      t.loader.update(scope()); await tick();
      if (failure) t.requests[0].reject({code:"unauthenticated"}); else t.requests[0].resolve(data(0,"other-visit"));
      await tick(); assert.equal(t.revalidations(),1); assert.equal(t.states.at(-1)?.status,"error");
      assert(!t.states.some(s=>s.status==="ready"));
    } finally {t.loader.stop();}
  }
});
