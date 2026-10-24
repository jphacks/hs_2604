import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { createHeadlessBackend, signInBackend } from "@kago/backend";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";
import { loadAccountSettings, loadPurchaseHistory, saveAccountSetting } from "../src/features/account/service.ts";
import { loadRecommendationInput } from "../src/features/recommendations/input.ts";

const fixture=await createCartBackend({accountHistory:true});
after(()=>fixture.close());
beforeEach(()=>fixture.db.exec("delete from customer_settings"));
async function client(user=3, fetcher?:typeof fetch) {
  const c=createHeadlessBackend({url:fixture.url,publishableKey:"sb_publishable_test"},fetcher);
  await signInBackend(c,`user${user}@example.test`,"fixture-password","customer");return c;
}
const a=await client(), b=await client(4);
const hasCode=(code:string)=>(error:unknown)=>(error as {code?:string}).code===code;
async function enable(key:"usePurchaseHistory"|"useCurrentCart",value:boolean,c=a,visit=id(13)) {
  const {settings}=await loadAccountSettings(c,visit);
  return saveAccountSetting(c,visit,{key,value,expectedUpdatedAt:settings.updatedAt});
}

test("missing settings use DB defaults; disabled recommendation inputs do not read private data",async()=>{
  assert.deepEqual((await loadAccountSettings(a,id(13))).settings,{usePurchaseHistory:false,useCurrentCart:false,updatedAt:null});
  const start=fixture.calls.length;const input=await loadRecommendationInput(a,id(13));
  assert.equal(input.history.status,"disabled");assert.equal(input.cart.status,"disabled");
  assert.deepEqual(input.history.orders,[]);assert.deepEqual(input.history.summaries,[]);assert.deepEqual(input.cart.items,[]);
  assert(!fixture.calls.slice(start).some(c=>["orders","cart_items"].includes(c.name)));
});
test("history pages only the current customer's store and past orders, with equal-time tie breaking",async()=>{
  const first=await loadPurchaseHistory(a,id(13));assert.equal(first.orders.length,10);assert(first.nextCursor);
  const last=await loadPurchaseHistory(a,id(13),first.nextCursor);assert.equal(last.orders.length,2);assert.equal(last.nextCursor,null);
  assert.equal(new Set([...first.orders,...last.orders].map(o=>o.id)).size,12);
  assert(first.orders.every(o=>o.items.every(i=>i.name==="購入時ミルク")));
  assert(first.orders[0].id>first.orders[1].id);
  assert.equal((await loadPurchaseHistory(a,id(14))).orders[0].items[0].name,"別店舗の購入品");
  assert.equal((await loadPurchaseHistory(b,id(15))).orders[0].items[0].name,"別利用者の購入品");
  assert.equal((await loadPurchaseHistory(b,id(16))).orders.length,0);
});
test("order names and prices remain purchase snapshots after master changes",async()=>{
  await fixture.db.query("update products set name='現在の商品名' where id=$1",[id(20)]);
  await fixture.db.query("update store_products set price=999 where product_id=$1",[id(20)]);
  try {const row=(await loadPurchaseHistory(a,id(13))).orders[0];assert.equal(row.items[0].name,"購入時ミルク");assert.equal(row.items[0].unitPrice,120);assert.equal(row.total,240);}
  finally {await fixture.db.query("update products set name='検証ミルク' where id=$1",[id(20)]);await fixture.db.query("update store_products set price=case when store_id=$1 then 248 else 298 end where product_id=$2",[id(1),id(20)]);}
});
test("settings persist per customer, update one field, and preserve existing slug",async()=>{
  await enable("usePurchaseHistory",true);await fixture.db.query("update customer_settings set slug='keep-me' where user_id=$1",[id(3)]);
  await enable("useCurrentCart",true);
  const another=await client();const restored=(await loadAccountSettings(another,id(13))).settings;
  assert.equal(restored.usePurchaseHistory,true);assert.equal(restored.useCurrentCart,true);
  assert.equal((await fixture.db.query<{slug:string}>("select slug from customer_settings where user_id=$1",[id(3)])).rows[0].slug,"keep-me");
  assert.equal((await loadAccountSettings(b,id(15))).settings.usePurchaseHistory,false);
});
test("enabled input contains real store history summaries and current cart",async()=>{
  await enable("usePurchaseHistory",true);await enable("useCurrentCart",true);
  const input=await loadRecommendationInput(a,id(13));assert.equal(input.history.status,"available");assert.equal(input.history.orders.length,12);
  assert.equal(input.history.summaries[0].productId,id(20));assert.equal(input.history.summaries[0].purchaseCount,12);assert.equal(input.history.summaries[0].totalQuantity,24);
  assert.equal(input.cart.status,"available");assert.equal(input.cart.items[0].quantity,2);assert.equal(input.scope.cartVersion,1);
});
test("OFF removes input without hiding the user's own history display",async()=>{
  await enable("usePurchaseHistory",true);await enable("useCurrentCart",true);await enable("usePurchaseHistory",false);
  const start=fixture.calls.length;const input=await loadRecommendationInput(a,id(13));
  assert.equal(input.history.status,"disabled");assert.deepEqual(input.history.orders,[]);assert.deepEqual(input.history.summaries,[]);assert.equal(input.cart.status,"available");
  assert(!fixture.calls.slice(start).some(c=>c.name==="orders"));
  assert.equal((await loadPurchaseHistory(a,id(13))).orders.length,10);
  await enable("useCurrentCart",false);assert.deepEqual((await loadRecommendationInput(a,id(13))).cart.items,[]);
});
test("enabled but empty history is distinct from disabled history",async()=>{
  await enable("usePurchaseHistory",true,b,id(16));
  const input=await loadRecommendationInput(b,id(16));assert.equal(input.history.status,"empty");assert.deepEqual(input.history.orders,[]);
});
test("retrying an absolute setting after a lost response is a no-op",async()=>{
  const intent={key:"usePurchaseHistory",value:true,expectedUpdatedAt:null};
  const first=await saveAccountSetting(a,id(13),intent);const second=await saveAccountSetting(a,id(13),intent);
  assert.equal(first.settings.updatedAt,second.settings.updatedAt);
  assert.equal((await fixture.db.query("select * from customer_settings")).rows.length,1);
});
test("stale settings cannot overwrite another browser's newer choice",async()=>{
  const first=await enable("usePurchaseHistory",true);await enable("useCurrentCart",true);
  await assert.rejects(saveAccountSetting(a,id(13),{key:"usePurchaseHistory",value:false,expectedUpdatedAt:first.settings.updatedAt}),hasCode("settings_changed"));
  assert.equal((await loadAccountSettings(a,id(13))).settings.usePurchaseHistory,true);
  assert.equal((await loadAccountSettings(a,id(13))).settings.useCurrentCart,true);
});
test("bad inputs and foreign visits never change another customer's data",async()=>{
  await assert.rejects(saveAccountSetting(a,id(13),{key:"usePurchaseHistory",value:"true",expectedUpdatedAt:null}),hasCode("invalid_request"));
  await assert.rejects(loadPurchaseHistory(b,id(13)),hasCode("visit_unavailable"));
  await assert.rejects(saveAccountSetting(b,id(13),{key:"usePurchaseHistory",value:true,expectedUpdatedAt:null}),hasCode("visit_unavailable"));
  await assert.rejects(loadPurchaseHistory(a,id(13),Buffer.from(JSON.stringify({at:"x),user_id.eq.any",id:id(1)})).toString("base64url")),hasCode("invalid_request"));
  assert.equal((await fixture.db.query("select * from customer_settings")).rows.length,0);
});
test("formal RLS denies foreign order items and settings writes",async()=>{
  assert.equal((await fixture.as(4,()=>fixture.db.query("select * from orders where user_id=$1",[id(3)]))).rows.length,0);
  assert.equal((await fixture.as(4,()=>fixture.db.query("select * from order_items where order_id=$1",[id(300)]))).rows.length,0);
  await assert.rejects(fixture.as(4,()=>fixture.db.query("insert into customer_settings(user_id,use_purchase_history) values ($1,true)",[id(3)])),hasCode("42501"));
  assert.equal((await fixture.as(3,()=>fixture.db.query("select * from orders"),"maker_staff")).rows.length,0);
});
test("opt-out during history loading invalidates the whole recommendation response",async()=>{
  await enable("usePurchaseHistory",true);let changed=false;
  const racing=await client(3,async(input,init)=>{
    const response=await fetch(input,init);
    if(new URL(String(input)).pathname.endsWith("/orders")&&!changed){changed=true;await enable("usePurchaseHistory",false);}
    return response;
  });
  await assert.rejects(loadRecommendationInput(racing,id(13)),hasCode("input_changed"));
  assert.equal((await loadRecommendationInput(a,id(13))).history.status,"disabled");
});
test("cart version changes during recommendation loading invalidate stale inputs",async()=>{
  await enable("useCurrentCart",true);let changed=false;
  const racing=await client(3,async(input,init)=>{
    const response=await fetch(input,init);
    if(new URL(String(input)).pathname.endsWith("/cart_items")&&!changed){changed=true;await fixture.rpc("app_set_cart_item",[id(13),id(2600),id(20),3,1,"manual",null]);}
    return response;
  });
  await assert.rejects(loadRecommendationInput(racing,id(13)),hasCode("input_changed"));
});
