import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHeadlessBackend, signInBackend } from "@kago/backend";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { seedEventSuggestions } from "./fixtures/app-events.mts";
import { id } from "./fixtures/cart-database.mts";
import { recordAppEvent } from "../src/features/events/service.ts";
import { selectAndSave } from "../src/features/recommendations/selection-service.ts";
import type { AssociationRuleSet } from "../src/features/recommendations/association.ts";
const fixture = await createCartBackend({ offers: true });
after(() => fixture.close());
await seedEventSuggestions(fixture);
const client = createHeadlessBackend({
  url: fixture.url,
  publishableKey: "sb_publishable_test",
});
await signInBackend(
  client,
  "user3@example.test",
  "fixture-password",
  "customer",
);
await fixture.rpc("app_set_cart_item", [
  id(13),
  id(4100),
  id(20),
  1,
  0,
  "manual",
  null,
]);
await fixture.rpc("app_set_cart_item", [
  id(13),
  id(4101),
  id(20),
  0,
  1,
  "manual",
  null,
]);
await fixture.rpc("app_set_cart_item", [
  id(13),
  id(4102),
  id(21),
  1,
  2,
  "manual",
  null,
]);
await fixture.rpc("app_set_cart_item", [
  id(13),
  id(4103),
  id(21),
  0,
  3,
  "manual",
  null,
]);
const envelope = (overrides: Record<string, unknown> = {}) => ({
  event_id: crypto.randomUUID(),
  schema_version: 1,
  occurred_at: new Date().toISOString(),
  user_id: id(3),
  visit_id: id(13),
  store_id: id(1),
  channel: "app",
  data_origin: "operated",
  selection_item_id: null,
  product_id: id(20),
  event_type: "removal_reason_prompted",
  payload: { removal_event_id: id(4101) },
  ...overrides,
});
const errorCode = (expected: string) => (e: unknown) =>
  (e as { code?: string }).code === expected;
test("提示と本人理由は削除1件へ対応し、同じ要求の再送で増えない", async () => {
  const shown = envelope();
  await recordAppEvent(client, shown);
  await recordAppEvent(client, shown);
  const entered = envelope({
    event_type: "removal_reason_submitted",
    payload: { removal_event_id: id(4101), reason: "別の商品にする" },
  });
  await recordAppEvent(client, entered);
  await recordAppEvent(client, entered);
  const rows = (
    await fixture.db.query<{
      event_type: string;
      payload: Record<string, unknown>;
    }>(
      "select event_type,payload from events where event_type like 'removal_reason_%'",
    )
  ).rows;
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.find((r) => r.event_type === "removal_reason_submitted")?.payload,
    { removal_event_id: id(4101), reason: "別の商品にする" },
  );
});
test("明示スキップは本人の理由を捏造しない", async () => {
  await recordAppEvent(
    client,
    envelope({
      event_type: "removal_reason_skipped",
      product_id: id(21),
      payload: { removal_event_id: id(4103) },
    }),
  );
  const rows = (
    await fixture.db.query<{ payload: Record<string, unknown> }>(
      "select payload from events where event_type='removal_reason_skipped'",
    )
  ).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].payload.reason, undefined);
});
test("別の商品・不存在・削除以外のイベントへの紐付けと未定義理由を拒否", async () => {
  for (const data of [
    { product_id: id(21) },
    { payload: { removal_event_id: id(999) } },
    { payload: { removal_event_id: id(4100) } },
    {
      event_type: "removal_reason_submitted",
      payload: { removal_event_id: id(4101), reason: "" },
    },
    {
      event_type: "removal_reason_submitted",
      payload: { removal_event_id: id(4101), reason: "unsupported" },
    },
  ])
    await assert.rejects(
      recordAppEvent(client, envelope(data)),
      errorCode("invalid_request"),
    );
});
test("同じIDの再送でも他人の来店を拒否", async () => {
  await assert.rejects(
    recordAppEvent(client, envelope({ visit_id: id(15) })),
    errorCode("forbidden"),
  );
});
test("DB直接書込も別商品の削除への参照を拒否", async () => {
  await assert.rejects(
    fixture.as(3, () =>
      fixture.db.query(
        "insert into events(event_id,event_type,schema_version,occurred_at,user_id,visit_id,store_id,channel,data_origin,product_id,payload) values ($1,'removal_reason_prompted',1,now(),$2,$3,$4,'app','operated',$5,$6::jsonb)",
        [
          crypto.randomUUID(),
          id(3),
          id(13),
          id(1),
          id(21),
          JSON.stringify({ removal_event_id: id(4101) }),
        ],
      ),
    ),
    errorCode("23503"),
  );
});
test("推薦非表示は本人の選定商品にのみ記録できる", async () => {
  const rules = JSON.parse(
    await readFile(
      new URL(
        "../src/features/recommendations/association-rules.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as AssociationRuleSet;
  const selection = await selectAndSave(client, id(13), rules);
  assert(selection.items.length > 0);
  const item = selection.items[0];
  const hidden = envelope({
    event_type: "recommendation_dismissed",
    selection_item_id: item.selectionItemId,
    product_id: item.product.productId,
    payload: {},
  });
  await recordAppEvent(client, hidden);
  await recordAppEvent(client, hidden);
  assert.equal(
    (
      await fixture.db.query<{ n: number }>(
        "select count(*)::int n from events where event_type='recommendation_dismissed'",
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(
    recordAppEvent(client, {
      ...hidden,
      event_id: crypto.randomUUID(),
      product_id: id(999),
    }),
    errorCode("invalid_request"),
  );
});
