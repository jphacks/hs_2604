import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { createDemoDatabase, userId } from "./fixtures/demo-database.mts";
const {db,seed}=await createDemoDatabase();after(()=>db.close());await seed();
const U3="0de005aa-0000-4000-8000-000000000003",S1="0da7a001-0000-4000-8000-000000000001",S2="0da7a001-0000-4000-8000-000000000002";
await db.query("insert into auth.users(id,email,raw_app_meta_data) values ($1,'yui.suzuki@example.test',$2)",[U3,{kago:{roles:["customer"]}}]);
await db.exec(await readFile(new URL("../../kago-core/supabase/seed/demo05_users_offers.sql",import.meta.url),"utf8"));
const source=await readFile(new URL("../../kago-core/supabase/demo/reset_demo_visits.sql",import.meta.url),"utf8");
const run=async()=>{try{await db.exec(source);}catch(e){await db.exec("rollback");throw e;}};
const confirm=()=>db.query("select set_config('kago.demo_reset','DEMO-11',false)");
const snapshot=async()=>({
 orders:(await db.query("select to_jsonb(o) as row from orders o order by id")).rows,
 items:(await db.query("select to_jsonb(i) as row from order_items i order by order_id,product_id")).rows,
 rates:(await db.query("select to_jsonb(o) as row from store_offers o order by id")).rows,
});
const preserved=await snapshot();
const old="0de0110a-0000-4000-8000-000000000001",other="0de0110a-0000-4000-8000-000000000002";
await db.query("insert into visits(id,user_id,store_id) values ($1,$3,$4),($2,$3,$5)",[old,other,userId("U1"),S1,S2]);
const product=(await db.query<{product_id:string}>("select product_id from store_offers where id='0de00506-0000-4000-8000-000000000001'")).rows[0].product_id;
await db.query("insert into cart_items(visit_id,product_id,quantity) values ($1,$2,1)",[old,product]);
await db.query("insert into visit_offer_claims(visit_id,offer_id,request_id,claimed_at) values ($1,'0de00506-0000-4000-8000-000000000001','0de0110e-0000-4000-8000-000000000001',now())",[old]);
await db.query("insert into offer_events(event_id,event_type,visit_id,user_id,store_id,offer_id,occurred_at) values ('0de0110f-0000-4000-8000-000000000001','offer_dismissed',$1,$2,$3,'0de00506-0000-4000-8000-000000000002',now())",[old,userId("U1"),S1]);
const otherBefore=(await db.query("select to_jsonb(v) as row from visits v where id=$1",[other])).rows;
test("reset refuses without one-use opt-in and makes no changes",async()=>{
 await assert.rejects(run(),/explicit demo reset confirmation/);
 assert.equal((await db.query<{status:string}>("select status from visits where id=$1",[old])).rows[0].status,"active");
});
test("two resets leave one clean active visit per demo user and retain history, rates and other store",async()=>{
 for(let attempt=0;attempt<2;attempt++){
  await confirm();await run();
  const active=await db.query<{id:string;user_id:string}>("select id,user_id from visits where store_id=$1 and status='active' and user_id in ($2,$3,$4)",[S1,userId("U1"),userId("U2"),U3]);
  assert.equal(active.rows.length,3);assert.equal(new Set(active.rows.map(r=>r.user_id)).size,3);
  for(const visit of active.rows){
   const count=(await db.query<{n:number}>("select ((select count(*) from cart_items where visit_id=$1)+(select count(*) from visit_offer_claims where visit_id=$1)+(select count(*) from offer_events where visit_id=$1))::int as n",[visit.id])).rows[0].n;
   assert.equal(count,0);
  }
  assert.deepEqual(await snapshot(),preserved);
  assert.deepEqual((await db.query("select to_jsonb(v) as row from visits v where id=$1",[other])).rows,otherBefore);
  await assert.rejects(run(),/explicit demo reset confirmation/);
 }
 assert.equal((await db.query<{status:string}>("select status from visits where id=$1",[old])).rows[0].status,"abandoned");
 assert.equal((await db.query<{n:number}>("select count(*)::int as n from visit_offer_claims where visit_id=$1",[old])).rows[0].n,1);
 assert.equal((await db.query<{n:number}>("select count(*)::int as n from offer_events where visit_id=$1",[old])).rows[0].n,1);
});
