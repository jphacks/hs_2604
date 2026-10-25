import assert from "node:assert/strict";
import { test } from "node:test";
import { decideCouponAppearance as decide, initialCouponAppearance as initial, readCouponAppearance } from "../src/features/offers/coupon-appearance.ts";

test("the first eligible candidate is guaranteed, without consuming randomness or empty opportunities", () => {
  const never = () => { throw Error("must not draw"); };
  const empty = decide(initial(), 0, null, never);
  assert.equal(empty.hasShown, false);
  assert.deepEqual(decide(empty, 1, "first", never), { hasShown: true, cartVersion: 1, offerId: "first", visible: true });
});
test("#172 demo: every later eligible coupon is shown, without drawing a random number", () => {
  const never = () => { throw Error("must not draw"); };
  let state = decide(initial(), 1, "first", never);
  for (let version = 2; version < 6; version++) {
    state = decide(state, version, `coupon-${version}`, never);
    assert.equal(state.visible, true);
  }
});
test("with a rate below 1 (e.g. #162's 40%), later opportunities use the strict threshold", () => {
  const first = decide(initial(), 1, "first");
  for (const [roll, visible] of [[0, true], [0.399999, true], [0.4, false], [0.99999, false]] as const) {
    assert.equal(decide(first, 2, "second", () => roll, 0.4).visible, visible);
  }
  assert.equal(Array.from({ length: 100 }, (_, n) => decide(first, 2, "next", () => n / 100, 0.4)).filter(v => v.visible).length, 40);
});
test("polling, retries, alternate candidates and reload never reroll either outcome", () => {
  for (const roll of [0.1, 0.9]) {
    const second = decide(decide(initial(), 1, "first"), 2, "second", () => roll, 0.4);
    const restored = readCouponAppearance(JSON.stringify(second));
    for (const candidate of ["second", "another", null]) assert.deepEqual(decide(restored, 2, candidate, () => { throw Error("reroll"); }), second);
  }
});
test("after a miss, the next saved cart version draws once again", () => {
  const miss = decide(decide(initial(), 1, "first"), 2, "next", () => 0.9, 0.4);
  assert.equal(decide(miss, 3, "next", () => 0.1, 0.4).visible, true);
});
test("a candidate appearing after an empty response in the same version can be considered once", () => {
  const empty = decide(initial(), 1, null);
  const first = decide(empty, 1, "first", () => 0.99);
  assert.equal(first.visible, true);
  assert.strictEqual(decide(first, 0, "stale"), first);
});
test("corrupt storage is ignored; a new visit starts a fresh guaranteed opportunity", () => {
  for (const raw of [null, "bad", "{}", '{"hasShown":true,"cartVersion":2,"offerId":null,"visible":true}',
    '{"hasShown":true,"cartVersion":-3,"offerId":"id","visible":false}']) assert.deepEqual(readCouponAppearance(raw), initial());
  assert.equal(decide(initial(), 0, "new-visit", () => 0.99).visible, true);
});
