import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHeadlessBackend, signInBackend } from "@kago/backend";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { seedEventSuggestions } from "./fixtures/app-events.mts";
import { id } from "./fixtures/cart-database.mts";
import { PRODUCT } from "./fixtures/offers.mts";
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
let version = 0;
async function set(
  product: string,
  quantity: number,
  selection: string | null = null,
) {
  const request = crypto.randomUUID();
  await fixture.rpc("app_set_cart_item", [
    id(13),
    request,
    product,
    quantity,
    version,
    selection ? "recommendation" : "manual",
    selection,
  ]);
  version++;
  return request;
}
await set(PRODUCT.pasta, 1);
const rules = JSON.parse(
  await readFile(
    new URL(
      "../src/features/recommendations/association-rules.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as AssociationRuleSet;
const selected = await selectAndSave(client, id(13), rules);
const ad = selected.items.find((i) => i.placementType === "sponsored")!,
  promo = selected.items.find((i) => i.placementType === "store_promo")!;
assert(ad && promo);
const env = (
  type: string,
  product: string | null,
  payload: object,
  selection: string | null = null,
) => ({
  event_id: crypto.randomUUID(),
  schema_version: 1,
  occurred_at: new Date().toISOString(),
  user_id: id(3),
  visit_id: id(13),
  store_id: id(1),
  channel: "app",
  data_origin: "operated",
  event_type: type,
  selection_item_id: selection,
  product_id: product,
  payload,
});
const impression = env(
  "recommendation_impression",
  ad.product.productId,
  { visible_ms: 1000 },
  ad.selectionItemId,
);
impression.occurred_at = new Date(Date.now() - 60000).toISOString();
await recordAppEvent(client, impression);
await set(ad.product.productId, 1, ad.selectionItemId);
const next = await selectAndSave(client, id(13), rules);
const nextPromo = next.items.find((i) => i.placementType === "store_promo")!;
assert(nextPromo);
await set(nextPromo.product.productId, 1, nextPromo.selectionItemId);
await recordAppEvent(
  client,
  env("recommendation_dismissed", ad.product.productId, {}, ad.selectionItemId),
);
for (let i = 0; i < 4; i++) {
  await set(id(20), 1);
  const removal = await set(id(20), 0);
  if (i < 3)
    await recordAppEvent(
      client,
      env("removal_reason_prompted", id(20), { removal_event_id: removal }),
    );
  if (i === 0)
    await recordAppEvent(
      client,
      env("removal_reason_submitted", id(20), {
        removal_event_id: removal,
        reason: "価格が合わない",
      }),
    );
  if (i === 1)
    await recordAppEvent(
      client,
      env("removal_reason_skipped", id(20), { removal_event_id: removal }),
    );
}
await recordAppEvent(
  client,
  env("product_compared", null, { product_ids: [id(20), id(21)] }),
);
const seeded = {
  ...env("product_compared", null, { product_ids: [id(20), id(21)] }),
  data_origin: "seeded",
};
await fixture.db.query(
  "insert into events(event_id,event_type,schema_version,occurred_at,user_id,visit_id,store_id,channel,data_origin,product_id,selection_item_id,payload) values ($1,$2,1,$3,$4,$5,$6,'app',$7,null,null,$8::jsonb)",
  [
    seeded.event_id,
    seeded.event_type,
    seeded.occurred_at,
    seeded.user_id,
    seeded.visit_id,
    seeded.store_id,
    seeded.data_origin,
    JSON.stringify(seeded.payload),
  ],
);
type Metrics = {
  methods: {
    reason_code: string;
    shown: number;
    added: number;
    dismissed: number;
  }[];
  removal_statuses: { status: string; count: number }[];
  removal_reasons: { reason: string; count: number }[];
  compared: number;
  unshown_adds: number;
  removals: number;
};
const start = new Date(Date.now() - 86400000).toISOString(),
  end = new Date(Date.now() + 86400000).toISOString();
async function metrics(
  origin = "operated",
  user = 5,
  role = "store_staff",
  store = id(1),
  a = start,
  b = end,
) {
  return fixture.as(
    user,
    async () =>
      (
        await fixture.db.query<{ v: Metrics }>(
          "select kago_detailed_insight($1,$2,$3,$4) v",
          [a, b, store, origin],
        )
      ).rows[0].v,
    role,
  );
}
const code = (c: string) => (e: unknown) => (e as { code?: string }).code === c;
test("表示された枠だけを母数とし、未表示の追加を分離する", async () => {
  const m = await metrics();
  assert.equal(m.methods.length, 1);
  assert.deepEqual(
    m.methods.map((x) => [x.shown, x.added, x.dismissed]),
    [[1, 1, 1]],
  );
  assert.equal(m.unshown_adds, 1);
  assert.equal(m.compared, 1);
});
test("元の削除4件で本人理由・スキップ・未入力・未収集を区別", async () => {
  const m = await metrics();
  assert.equal(m.removals, 4);
  assert.deepEqual(
    Object.fromEntries(m.removal_statuses.map((x) => [x.status, x.count])),
    { submitted: 1, skipped: 1, unanswered: 1, uncollected: 1 },
  );
  assert.deepEqual(m.removal_reasons, [{ count: 1, reason: "価格が合わない" }]);
});
test("由来を合算せず、未収集の実測値を作らない", async () => {
  const m = await metrics("seeded");
  assert.equal(m.compared, 1);
  assert.deepEqual(m.methods, []);
  assert.deepEqual(m.removal_statuses, []);
  assert.equal(m.removals, 0);
});
test("空の期間は比較・理由の観測がない結果であり個人IDを返さない", async () => {
  const m = await metrics(
    "operated",
    5,
    "store_staff",
    id(1),
    "2020-01-01T00:00:00Z",
    "2020-01-02T00:00:00Z",
  );
  assert.deepEqual(m.methods, []);
  assert.deepEqual(m.removal_statuses, []);
  const text = JSON.stringify(await metrics());
  for (const key of ["user_id", "visit_id", "event_id", "selection_item_id"])
    assert.ok(!text.includes(key));
});
test("他店・customer・makerを拒否", async () => {
  await assert.rejects(
    metrics("operated", 5, "store_staff", id(2)),
    code("42501"),
  );
  await assert.rejects(metrics("operated", 3, "customer"), code("42501"));
  await assert.rejects(metrics("operated", 5, "maker_staff"), code("42501"));
});
test("逆転・31日超・未定義由来を拒否", async () => {
  await assert.rejects(metrics("bad"), code("22023"));
  await assert.rejects(
    metrics("operated", 5, "store_staff", id(1), end, start),
    code("22023"),
  );
  await assert.rejects(
    metrics(
      "operated",
      5,
      "store_staff",
      id(1),
      "2026-01-01T00:00:00Z",
      "2026-03-01T00:00:00Z",
    ),
    code("22023"),
  );
});

test("表示前に追加した枠は追加率へ混ぜない", async () => {
  const later = env(
    "recommendation_impression",
    nextPromo.product.productId,
    { visible_ms: 1000 },
    nextPromo.selectionItemId,
  );
  later.occurred_at = new Date(Date.now() + 5000).toISOString();
  await recordAppEvent(client, later);
  const m = await metrics();
  const method = m.methods.find((x) => x.reason_code === "store_pick");
  assert(method);
  assert.equal(method.added, 0);
  assert.equal(m.unshown_adds, 1);
});
test("旧形式の自由記述は集計でも原文を返さない", async () => {
  const removal = (
    await fixture.db.query<{ event_id: string }>(
      "select event_id from events where event_type='cart_item_removed' order by received_at desc limit 1",
    )
  ).rows[0].event_id;
  const e = env("removal_reason_submitted", id(20), {
    removal_event_id: removal,
    reason: "自由記述のテスト",
  });
  await fixture.db.query(
    "insert into events(event_id,event_type,schema_version,occurred_at,user_id,visit_id,store_id,channel,data_origin,product_id,payload) values ($1,$2,1,$3,$4,$5,$6,'app','operated',$7,$8::jsonb)",
    [
      e.event_id,
      e.event_type,
      e.occurred_at,
      e.user_id,
      e.visit_id,
      e.store_id,
      e.product_id,
      JSON.stringify(e.payload),
    ],
  );
  const m = await metrics();
  assert.ok(!JSON.stringify(m).includes("自由記述のテスト"));
  assert.ok(m.removal_reasons.some((r) => r.reason === "その他の入力理由"));
});
