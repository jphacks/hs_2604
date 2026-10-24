import assert from "node:assert/strict";
import { after,test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createHeadlessBackend,signInBackend } from "@kago/backend";
import { createCartBackend } from "./fixtures/cart-backend.mts";
import { id } from "./fixtures/cart-database.mts";
import { OFFER,PRODUCT } from "./fixtures/offers.mts";
import { checkoutError,confirmCheckout,loadCheckout } from "../src/features/checkout/service.ts";
import { isCheckoutIntent,type CheckoutIntent,type CheckoutQuote } from "../src/features/checkout/contracts.ts";
import { loadPurchaseHistory,loadAccountSettings,saveAccountSetting } from "../src/features/account/service.ts";
import { loadRecommendationInput } from "../src/features/recommendations/input.ts";

const fixture=await createCartBackend({offers:true});after(()=>fixture.close());
async function client(user=3,fetcher?:typeof fetch) {
  const c=createHeadlessBackend({url:fixture.url,publishableKey:"sb_publishable_test"},fetcher);
  await signInBackend(c,`user${user}@example.test`,"fixture-password","customer");return c;
}
const a=await client(),b=await client(4);
async function fresh() {
  await fixture.db.query("update store_products set price=248,is_active=true where store_id=$1 and product_id=$2",[id(1),id(20)]);
  const active=(await fixture.db.query<{id:string}>("select id from visits where user_id=$1 and store_id=$2 and status='active'",[id(3),id(1)])).rows[0];
  return await fixture.rpc("app_start_visit",[id(1),true,active?.id??null]) as string;
}
const set=(visit:string,product:string,quantity:number,version:number)=>fixture.rpc("app_set_cart_item",[visit,crypto.randomUUID(),product,quantity,version,"manual",null]);
async function quote(visit:string):Promise<CheckoutQuote> {const data=await loadCheckout(a,visit);assert(data.state==="review");return data.quote;}
const intent=(q:CheckoutQuote):CheckoutIntent=>({userId:q.userId,visitId:q.visitId,requestId:crypto.randomUUID(),expectedVersion:q.cartVersion,expectedTotal:q.total});
const rejected=(code:string)=>(error:unknown)=>checkoutError(error).code===code;
const orders=async(visit:string)=>(await fixture.db.query<{n:number}>("select count(*)::int n from orders where visit_id=$1",[visit])).rows[0].n;

test("confirmation saves one immutable order/receipt, ends the visit and makes history available to the next visit and recommendation input",async()=>{
  const visit=await fresh();await set(visit,id(20),2,0);const q=await quote(visit);assert.equal(q.total,496);
  const op=intent(q),first=await confirmCheckout(a,op),again=await confirmCheckout(a,op);
  assert(first.state==="complete"&&again.state==="complete");assert.equal(again.receipt.orderId,first.receipt.orderId);assert.equal(again.replayed,true);
  assert.equal(first.receipt.dataOrigin,"operated");assert.equal(first.receipt.lines[0].quantity,2);assert.equal(await orders(visit),1);
  assert.equal((await fixture.db.query<{status:string}>("select status from visits where id=$1",[visit])).rows[0].status,"completed");
  assert.equal((await loadCheckout(a,visit)).state,"complete");
  const next=await fresh();const history=await loadPurchaseHistory(a,next);assert(history.orders.some(o=>o.id===first.receipt.orderId));
  const settings=await loadAccountSettings(a,next);await saveAccountSetting(a,next,{key:"usePurchaseHistory",value:true,expectedUpdatedAt:settings.settings.updatedAt});
  const input=await loadRecommendationInput(a,next);assert(input.history.orders.some(o=>o.id===first.receipt.orderId));
  assert(input.history.summaries.some(s=>s.productId===id(20)&&s.totalQuantity===2));
  // Receipt uses the stored line snapshot, not the subsequently edited product/master price.
  await fixture.db.query("update store_products set price=999 where store_id=$1 and product_id=$2",[id(1),id(20)]);
  const old=await loadCheckout(a,visit);assert(old.state==="complete");assert.equal(old.receipt.total,496);assert.equal(old.receipt.lines[0].unitPrice,248);
});

test("price and cart version changes reject the old confirmation without an order and require a fresh explicit intent",async()=>{
  const visit=await fresh();await set(visit,id(20),1,0);const old=intent(await quote(visit));
  await fixture.db.query("update store_products set price=278 where store_id=$1 and product_id=$2",[id(1),id(20)]);
  await assert.rejects(confirmCheckout(a,old),rejected("price_changed"));assert.equal(await orders(visit),0);
  const current=intent(await quote(visit));assert.equal(current.expectedTotal,278);
  await set(visit,id(20),2,1);await assert.rejects(confirmCheckout(a,current),rejected("cart_changed"));assert.equal(await orders(visit),0);
  const done=await confirmCheckout(a,intent(await quote(visit)));assert(done.state==="complete");assert.equal(done.receipt.total,556);
});

test("set discounts are confirmed at the cart's discounted total and preserved separately from full-price line snapshots",async()=>{
  const visit=await fresh();await set(visit,PRODUCT.pasta,1,0);
  await fixture.rpc("app_claim_offer",[visit,crypto.randomUUID(),OFFER.set,1]);
  const q=await quote(visit);assert.equal(q.subtotal,546);assert.equal(q.discountTotal,53);assert.equal(q.total,493);
  assert(q.lines.every(line=>line.discount&&line.offerKind==="set_deal"));
  const done=await confirmCheckout(a,intent(q));assert(done.state==="complete");assert.equal(done.receipt.discountTotal,53);
  assert.equal(done.receipt.lines.reduce((n,line)=>n+line.unitPrice*line.quantity,0),546);
  assert.equal(done.receipt.lines.reduce((n,line)=>n+line.discount,0),53);
  assert.equal((await fixture.db.query("select * from order_discounts where order_id=$1",[done.receipt.orderId])).rows.length,2);
});

test("removing one set item removes its discount; a claimed coupon is included in checkout",async()=>{
  const visit=await fresh();await set(visit,PRODUCT.pasta,1,0);await fixture.rpc("app_claim_offer",[visit,crypto.randomUUID(),OFFER.set,1]);
  await set(visit,PRODUCT.pasta,0,2);const q=await quote(visit);assert.equal(q.discountTotal,0);assert.equal(q.total,298);
  const done=await confirmCheckout(a,intent(q));assert(done.state==="complete");assert.equal(done.receipt.discountTotal,0);
  const couponVisit=await fresh();await set(couponVisit,PRODUCT.pasta,1,0);await fixture.rpc("app_claim_offer",[couponVisit,crypto.randomUUID(),OFFER.coupon,1]);
  const coupon=await quote(couponVisit);assert.equal(coupon.discountTotal,49);assert.equal(coupon.total,397);
  const purchased=await confirmCheckout(a,intent(coupon));assert(purchased.state==="complete");assert.equal(purchased.receipt.discountTotal,49);
});

test("a time sale claimed before its end keeps the received discount when purchased after the sale ends",async()=>{
  const visit=await fresh(),offer=crypto.randomUUID();
  await fixture.db.query("insert into store_offers(id,store_id,kind,product_id,discount_percent,headline,starts_at,ends_at) values ($1,$2,'time_sale',$3,20,'短時間の検証セール',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 second')",[offer,id(1),id(20)]);
  await fixture.rpc("app_claim_offer",[visit,crypto.randomUUID(),offer,0]);
  await delay(1100);const q=await quote(visit);assert.equal(q.discountTotal,49);assert.equal(q.total,199);
  const done=await confirmCheckout(a,intent(q));assert(done.state==="complete");assert.equal(done.receipt.total,199);
});

test("a mid-write failure rolls back order, lines and visit end; retrying the original intent succeeds once",async()=>{
  const visit=await fresh();await set(visit,id(20),1,0);await set(visit,id(21),1,1);const op=intent(await quote(visit));
  await fixture.db.exec(`create function public.app09_test_fail() returns trigger language plpgsql as $$begin raise exception 'simulated failure' using errcode='XX000';end;$$;
    create trigger app09_test_fail before insert on public.order_items for each row execute function public.app09_test_fail();`);
  await assert.rejects(confirmCheckout(a,op),rejected("connection_failed"));assert.equal(await orders(visit),0);
  assert.equal((await fixture.db.query<{status:string}>("select status from visits where id=$1",[visit])).rows[0].status,"active");
  await fixture.db.exec("drop trigger app09_test_fail on public.order_items; drop function public.app09_test_fail()");
  const first=await confirmCheckout(a,op),second=await confirmCheckout(a,op);assert(first.state==="complete"&&second.state==="complete");
  assert.equal(first.receipt.lines.length,2);assert.equal(first.receipt.orderId,second.receipt.orderId);assert.equal(await orders(visit),1);
});

test("a receipt-read failure after DB commit is recoverable by reading or replaying the same completed visit",async()=>{
  const visit=await fresh();await set(visit,id(20),1,0);const op=intent(await quote(visit));let fail=true;
  const c=await client(3,async(input,init)=>{
    if(fail&&new URL(String(input)).pathname.endsWith("/orders"))return new Response(JSON.stringify({code:"XX000",message:"test response lost"}),{status:503,headers:{"Content-Type":"application/json"}});
    return fetch(input,init);
  });
  await assert.rejects(confirmCheckout(c,op));assert.equal(await orders(visit),1);fail=false;
  assert.equal((await loadCheckout(c,visit)).state,"complete");
  const again=await confirmCheckout(c,op);assert(again.state==="complete");assert.equal(again.replayed,true);assert.equal(await orders(visit),1);
});

test("empty/unavailable carts, another customer's visit, altered retry keys and invalid intents cannot buy",async()=>{
  const visit=await fresh();let q=await quote(visit);assert.equal(q.canCheckout,false);await assert.rejects(confirmCheckout(a,intent(q)),rejected("checkout_unavailable"));
  await set(visit,id(20),1,0);q=await quote(visit);const op=intent(q);
  await assert.rejects(loadCheckout(b,visit),rejected("forbidden"));await assert.rejects(confirmCheckout(b,op),rejected("forbidden"));
  await assert.rejects(confirmCheckout(b,{...op,userId:id(4)}),rejected("forbidden"));
  await fixture.db.query("update store_products set is_active=false where store_id=$1 and product_id=$2",[id(1),id(20)]);
  assert.equal((await quote(visit)).canCheckout,false);await assert.rejects(confirmCheckout(a,op),rejected("checkout_unavailable"));
  await fixture.db.query("update store_products set is_active=true where store_id=$1 and product_id=$2",[id(1),id(20)]);
  await confirmCheckout(a,op);await assert.rejects(confirmCheckout(a,{...op,expectedTotal:1}),rejected("checkout_conflict"));
  await assert.rejects(confirmCheckout(a,{...op,requestId:crypto.randomUUID()}),rejected("checkout_conflict"));
  for(const value of [null,[],{...op,userId:"bad"},{...op,expectedTotal:-1},{...op,expectedVersion:1.5},{...op,expectedTotal:2147483648}]) {
    assert.equal(isCheckoutIntent(value),false);await assert.rejects(confirmCheckout(a,value),rejected("invalid_request"));
  }
  assert.equal(await orders(visit),1);
});
