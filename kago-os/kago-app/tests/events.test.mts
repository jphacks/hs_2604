import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHeadlessBackend, signInBackend } from "@kago/backend";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";
import { seedEventSuggestions } from "./fixtures/app-events.mts";
import { PRODUCT } from "./fixtures/offers.mts";
import { recordAppEvent } from "../src/features/events/service.ts";
import { EventOutbox } from "../src/features/events/outbox.ts";
import type { AppEvent } from "../src/features/events/contracts.ts";
import { selectAndSave } from "../src/features/recommendations/selection-service.ts";
import { setCartItem } from "../src/features/cart/service.ts";
import type { AssociationRuleSet } from "../src/features/recommendations/association.ts";

const fixture = await createCartBackend({ offers: true });
after(() => fixture.close());
await seedEventSuggestions(fixture);
const rules = JSON.parse(await readFile(new URL("../src/features/recommendations/association-rules.json", import.meta.url), "utf8")) as AssociationRuleSet;
const client = createHeadlessBackend({ url: fixture.url, publishableKey: "sb_publishable_test" });
await signInBackend(client, "user3@example.test", "fixture-password", "customer");
await fixture.rpc("app_set_cart_item", [id(13), id(2001), PRODUCT.pasta, 1, 0, "manual", null]);
const selection = await selectAndSave(client, id(13), rules);
const ad = selection.items.find(i => i.placementType === "sponsored")!;
assert(ad);
const event = (overrides: Partial<AppEvent> = {}): AppEvent => ({
  event_id: crypto.randomUUID(), event_type: "recommendation_impression", schema_version: 1,
  occurred_at: new Date().toISOString(), channel: "app", data_origin: "operated",
  user_id: id(3), visit_id: id(13), store_id: id(1), selection_item_id: ad.selectionItemId,
  product_id: ad.product.productId, payload: { visible_ms: 1000 }, ...overrides,
} as AppEvent);
const count = async (where = "true") => (await fixture.db.query<{ n: number }>(`select count(*)::int n from events where ${where}`)).rows[0].n;
const code = (expected: string) => (e: unknown) => (e as { code?: string }).code === expected;

test("real ad: impression → detail/add clicks → add → remove; replay/reload are no-ops; unshown slots have no impressions", async () => {
  const shown = event();
  await recordAppEvent(client, shown); await recordAppEvent(client, shown);
  await recordAppEvent(client, event()); // reload: a new id for the same slot is still deduped
  const click = event({ event_type: "recommendation_click", payload: { target: "detail" } });
  await recordAppEvent(client, click); await recordAppEvent(client, click);
  await recordAppEvent(client, event({ event_type: "recommendation_click", payload: { target: "add_button" } }));
  const operation = { visitId: id(13), requestId: id(2002), expectedVersion: 1, productId: ad.product.productId, quantity: 1, source: "recommendation" as const, selectionItemId: ad.selectionItemId };
  await setCartItem(client, id(13), operation); await setCartItem(client, id(13), operation);
  const removal = { ...operation, requestId: id(2003), expectedVersion: 2, quantity: 0, source: "manual" as const, selectionItemId: undefined };
  await setCartItem(client, id(13), removal); await setCartItem(client, id(13), removal);
  const rows = (await fixture.db.query<{ event_type: string; n: number }>("select event_type,count(*)::int n from events where product_id=$1 group by event_type order by event_type", [ad.product.productId])).rows;
  assert.deepEqual(rows, [{event_type:"cart_item_added",n:1},{event_type:"cart_item_removed",n:1},{event_type:"recommendation_click",n:2},{event_type:"recommendation_impression",n:1}]);
  assert.equal(await count(`event_type='product_scanned'`), 0, "recommendation additions do not emit a manual scan");
  assert.equal(await count(`event_type='recommendation_impression' and selection_item_id<>'${ad.selectionItemId}'`), 0);
  assert.equal(await count(`event_type='cart_item_added' and selection_item_id='${ad.selectionItemId}' and payload->>'source'='recommendation'`), 1);
  await assert.rejects(recordAppEvent(client, { ...click, payload: { target: "add_button" } }), code("23505"));
});

test("rejects another user/visit/store, wrong slot/product, malformed payloads, forged cart and scan events", async () => {
  const before = await count();
  for (const input of [event({ user_id: id(4) }), event({ visit_id: id(15) }), event({ store_id: id(2) })]) await assert.rejects(recordAppEvent(client, input), code("forbidden"));
  for (const input of [event({ product_id: id(20), event_type: "recommendation_click", payload: { target: "detail" } }),
    event({ selection_item_id: id(9999) }), event({payload:{visible_ms:999}}), { ...event(), event_type: "cart_item_added" },
    { ...event(), event_type: "product_scanned" }, { ...event(), schema_version: 2 }]) await assert.rejects(recordAppEvent(client, input), code("invalid_request"));
  assert.equal(await count(), before);
});

test("a failed add leaves the click only; quick click never fabricates an impression", async () => {
  const unshown = selection.items.find(i => i.placementType === "store_promo")!;
  await recordAppEvent(client, event({ event_type: "recommendation_click", selection_item_id: unshown.selectionItemId, product_id: unshown.product.productId, payload: { target: "add_button" } }));
  await assert.rejects(setCartItem(client, id(13), { visitId:id(13),requestId:id(2004),expectedVersion:1,productId:unshown.product.productId,quantity:1,source:"recommendation",selectionItemId:unshown.selectionItemId }), code("40001"));
  assert.equal(await count(`selection_item_id='${unshown.selectionItemId}' and event_type='recommendation_click'`), 1);
  assert.equal(await count(`selection_item_id='${unshown.selectionItemId}' and event_type<>'recommendation_click'`), 0);
});

test("comparison shares the event envelope and validates distinct store products; own ended visits accept delayed events", async () => {
  await recordAppEvent(client, event({ event_type: "product_compared", selection_item_id: null, product_id: null, payload: { product_ids: [id(20),id(21)] } }));
  await assert.rejects(recordAppEvent(client, event({ event_type: "product_compared", selection_item_id:null,product_id:null,payload:{product_ids:[id(20),id(20)]} })), code("invalid_request"));
  const delayed = event({event_type:"recommendation_click",payload:{target:"detail"}});
  await fixture.rpc("app_start_visit", [id(1), true, id(13)]);
  await recordAppEvent(client, delayed); await recordAppEvent(client, delayed);
  assert.equal(await count(`event_id='${delayed.event_id}'`), 1);
});

test("outbox retries unchanged envelopes after reload, serializes flushes and skips terminal failures", async () => {
  let saved = "[]"; const storage = {getItem: () => saved, setItem: (_:string,v:string) => {saved=v;}};
  const calls: AppEvent[] = []; const first = event(), second = event({event_type:"recommendation_click",payload:{target:"detail"}});
  const queue = new EventOutbox("test", storage, async e => { calls.push(structuredClone(e)); throw Error("offline"); });
  queue.enqueue(first); queue.enqueue(first); queue.enqueue(second);
  await queue.flush(); assert.equal(calls.length,1);
  assert.equal(JSON.parse(saved).length,2);
  const restored = new EventOutbox("test", storage, async e => {calls.push(structuredClone(e)); return e.event_id === first.event_id ? 400 : 200;});
  await Promise.all([restored.flush(),restored.flush()]);
  assert.deepEqual(calls,[first,first,second]); assert.deepEqual(JSON.parse(saved),[]);
});

test("storage failures do not throw or block shopping; 401/429/503 keep the same record pending", async () => {
  for (const status of [401,429,503]) {
    let attempts=0; const original=event(); const sent:AppEvent[]=[];
    const queue = new EventOutbox("test", {getItem:()=>{throw Error();},setItem:()=>{throw Error();}}, async e=>{sent.push(e);return attempts++?200:status;});
    queue.enqueue(original); await queue.flush(); await queue.flush();
    assert.deepEqual(sent,[original,original]);
  }
});

test("a stopped provider cannot overwrite a restored queue when its old response arrives late", async () => {
  let saved="[]"; const storage={getItem:()=>saved,setItem:(_:string,v:string)=>{saved=v;}};
  let complete!: (status:number)=>void;
  const first=event(), second=event({event_type:"recommendation_click",payload:{target:"detail"}});
  const old=new EventOutbox("test",storage,()=>new Promise(resolve=>{complete=resolve;}));
  old.enqueue(first); const inFlight=old.flush(); old.stop();
  const restored=new EventOutbox("test",storage,async()=>200); restored.enqueue(second);
  complete(200); await inFlight;
  assert.deepEqual(JSON.parse(saved),[first,second]);
  await restored.flush(); assert.deepEqual(JSON.parse(saved),[]);
});
