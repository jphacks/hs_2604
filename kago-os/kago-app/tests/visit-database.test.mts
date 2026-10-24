import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { BackendError, createHeadlessBackend } from "@kago/backend";
import { loadShoppingContext, startShoppingVisit } from "../src/features/shopping/service.ts";

// Official SQL and RLS through DB-06 in a disposable PostgreSQL engine.
// Auth claims are simulated; no grants or policies are added by this test.
const db = new PGlite();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const claims = (user = 3, role = "customer") => ({ sub: id(user), app_metadata: { kago: { roles: [role] } } });
const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key, email text);
  grant usage on schema auth to anon, authenticated, service_role;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select (auth.jwt()->>'sub')::uuid
  $$;
`);
for (const file of ["20261024020000_connection_check.sql", "20261024030000_store_product_settings.sql", "20261024040000_visits_cart_orders.sql", "20261024041000_app_start_visit.sql", "20261024050000_ads_promotions.sql", "20261024060000_selections_events_signage.sql", "20261024070000_access_policies.sql"]) {
  await db.exec(await readFile(new URL(`../../kago-core/supabase/migrations/${file}`, import.meta.url), "utf8"));
}
after(() => db.close());
before(async () => {
  for (const file of ["db02.sql", "db03.sql", "db04.sql", "db05.sql", "db06.sql"]) {
    await db.exec(await readFile(new URL(`../../kago-core/supabase/tests/${file}`, import.meta.url), "utf8"));
  }
});
beforeEach(async () => {
  await db.exec("begin");
  await db.query("insert into auth.users(id,email) values ($1,'one@example.test'),($2,'two@example.test')", [id(3), id(4)]);
  await db.query("insert into stores(id,slug,name) values ($1,'one','架空1号店'),($2,'two','架空2号店')", [id(1), id(2)]);
  await db.query("insert into products(id,code,name,category) values ($1,'0123456789012','検証用ミルク','乳製品')", [id(5)]);
  await db.query("insert into store_products(store_id,product_id,price) values ($1,$3,248),($2,$3,298)", [id(1), id(2), id(5)]);
});
afterEach(() => db.exec("rollback; reset role"));

async function asUser(user = 3, role = "customer") {
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims(user, role))]);
  await db.exec("set role authenticated");
}
async function owner() { await db.exec("reset role"); }
async function start(store = id(1), fresh = false, previous: string | null = null) {
  const result = await db.query<{ id: string }>("select app_start_visit($1::uuid,$2::boolean,$3::uuid) as id", [store, fresh, previous]);
  return result.rows[0].id;
}

// A single PGlite connection cannot carry two role contexts concurrently. Serialize
// HTTP-adapter requests so Promise.all cannot accidentally execute as the owner.
let requestQueue = Promise.resolve();
async function customerRequest<T>(user: number, operation: () => Promise<T>): Promise<T> {
  const previous = requestQueue;
  let finish!: () => void;
  requestQueue = new Promise<void>(resolve => { finish = resolve; });
  await previous;
  try {
    await asUser(user);
    await db.exec("savepoint transport_request");
    try {
      const result = await operation();
      await db.exec("release savepoint transport_request");
      return result;
    } catch (error) {
      await db.exec("rollback to transport_request; release savepoint transport_request");
      throw error;
    } finally { await owner(); }
  } finally { finish(); }
}

function databaseClient(userNumber = 3) {
  const actor = claims(userNumber);
  const user = { id:id(userNumber), aud:"authenticated", created_at:"2026-10-24T00:00:00Z",app_metadata:actor.app_metadata,user_metadata:{} };
  const token = [{alg:"HS256",typ:"JWT"},{sub:id(userNumber),exp:Math.floor(Date.now()/1000)+3600}].map(p=>Buffer.from(JSON.stringify(p)).toString("base64url")).join(".")+".test";
  return createHeadlessBackend({url:"https://test.supabase.co",publishableKey:"sb_publishable_test"},async(input,init)=>{
    const url=new URL(String(input));
    if(url.pathname.endsWith("/token"))return Response.json({access_token:token,refresh_token:"test-refresh",expires_in:3600,token_type:"bearer",user});
    if(url.pathname.endsWith("/user"))return Response.json(user);
    if(url.pathname.endsWith("/logout"))return new Response(null,{status:204});
    try {
      return await customerRequest(userNumber, async () => {
        const table=url.pathname.split("/").at(-1);
        if(table==="app_start_visit"){
          const body=JSON.parse(String(init?.body));
          return Response.json(await start(body.p_store_id,body.p_start_new,body.p_previous_visit_id));
        }
        if(table==="stores")return Response.json((await db.query("select id,slug,name,branch_name from stores order by name")).rows);
        if(table==="visits")return Response.json((await db.query("select id,store_id,cart_version,started_at from visits where ($1::uuid is null or user_id=$1) and ($2::uuid is null or id=$2) and ($3::text is null or status=$3) order by started_at desc",[url.searchParams.get("user_id")?.slice(3)??null,url.searchParams.get("id")?.slice(3)??null,url.searchParams.get("status")?.slice(3)??null])).rows);
        if(table==="cart_items")return Response.json((await db.query("select product_id,quantity from cart_items where visit_id=$1",[url.searchParams.get("visit_id")!.slice(3)])).rows);
        if(table==="products")return Response.json((await db.query("select id,code,name,category from products")).rows);
        if(table==="store_products")return Response.json((await db.query("select product_id,price from store_products where store_id=$1",[url.searchParams.get("store_id")!.slice(3)])).rows);
        throw new Error("Unexpected endpoint");
      });
    } catch(error) {
      return Response.json({code:(error as {code?:string}).code??"XX000",message:"DB request rejected"},{status:400});
    }
  });
}
test("official DB-06 permits visit RPC while denying direct lifecycle/cart writes", async () => {
  const functions = await db.query<{ prosecdef: boolean }>("select prosecdef from pg_proc where oid='public.app_start_visit(uuid,boolean,uuid)'::regprocedure");
  assert.equal(functions.rows[0].prosecdef, true);
  await asUser();
  const visit = await start();
  assert.ok(visit);
  for (const statement of [
    "insert into visits(user_id,store_id) values (auth.uid(),'"+id(1)+"')",
    "update visits set status='abandoned',ended_at=clock_timestamp() where id='"+visit+"'",
    "insert into cart_items(visit_id,product_id,quantity) values ('"+visit+"','"+id(5)+"',1)",
  ]) {
    await db.exec("savepoint denied");
    await assert.rejects(db.exec(statement),code("42501"));
    await db.exec("rollback to denied");
  }
});

test("start, resume and duplicate requests preserve one active visit and its cart", async () => {
  await asUser();
  const first = await start();
  assert.equal(await start(), first);
  assert.equal(await start(id(1), true, null), first);
  await owner();
  await db.query("insert into cart_items(visit_id,product_id,quantity) values ($1,$2,2)", [first,id(5)]);
  await asUser();
  assert.equal(await start(id(1), false, first), first);
  const cart = await db.query<{ quantity: number }>("select quantity from cart_items where visit_id=$1", [first]);
  assert.equal(cart.rows[0].quantity, 2);
});

test("explicit restart archives the prior visit, keeps its cart, and cannot restart twice", async () => {
  await asUser();
  const first = await start();
  await owner();
  await db.query("insert into cart_items values ($1,$2,2,now())", [first,id(5)]);
  await asUser();
  const next = await start(id(1), true, first);
  assert.notEqual(next, first);
  assert.equal(await start(id(1), true, first), next);
  const old = await db.query<{ status: string; ended_at: Date }>("select status,ended_at from visits where id=$1", [first]);
  assert.equal(old.rows[0].status, "abandoned");
  assert.ok(old.rows[0].ended_at);
  assert.equal((await db.query("select * from cart_items where visit_id=$1", [next])).rows.length, 0);
  assert.equal((await db.query("select * from cart_items where visit_id=$1", [first])).rows.length, 1);
});

test("users and stores remain separate; foreign previous visits are refused", async () => {
  await asUser(3);
  const a = await start();
  const otherStore = await start(id(2));
  assert.notEqual(a, otherStore);
  await asUser(4);
  const b = await start();
  assert.notEqual(a, b);
  assert.equal((await db.query("select * from visits where id=$1", [a])).rows.length, 0);
  await db.exec("savepoint foreign_visit");
  await assert.rejects(start(id(1), true, a), code("42501"));
  await db.exec("rollback to foreign_visit");
  assert.equal(await start(), b);
});

test("official DB-06 refuses wrong-role and anonymous visit execution", async () => {
  await asUser(3,"maker_staff");
  await db.exec("savepoint wrong_role");
  await assert.rejects(start(), code("42501"));
  await db.exec("rollback to wrong_role; reset role; set role anon");
  await assert.rejects(start(), code("42501"));
});

test("an ended visit starts a fresh visit on the next entry; malformed modes fail", async () => {
  await asUser();
  const first = await start();
  await owner();
  await db.query("update visits set status='completed',ended_at=clock_timestamp() where id=$1", [first]);
  await asUser();
  await db.exec("savepoint stale");
  await assert.rejects(start(id(1),true,first), code("40001"));
  await db.exec("rollback to stale");
  assert.notEqual(await start(), first);
  await db.exec("savepoint missing_store");
  await assert.rejects(start(id(999)), code("42501"));
  await db.exec("rollback to missing_store");
  await assert.rejects(db.query("select app_start_visit($1,null,null)",[id(1)]), code("22023"));
});

test("existing ambiguous active visits are rejected without modifying either cart", async () => {
  await db.query("insert into visits(user_id,store_id) values ($1,$2),($1,$2)",[id(3),id(1)]);
  await asUser();
  await db.exec("savepoint ambiguous");
  await assert.rejects(start(), code("23514"));
  await db.exec("rollback to ambiguous");
  assert.equal((await db.query("select * from visits where status='active'")).rows.length,2);
});

test("failure after ending a prior visit rolls back its status and cart", async () => {
  await asUser();
  const first = await start();
  await owner();
  await db.query("insert into cart_items(visit_id,product_id,quantity) values ($1,$2,2)",[first,id(5)]);
  await db.exec(`create function pg_temp.fail_visit() returns trigger language plpgsql as $$ begin raise exception 'test rollback' using errcode='23514'; end $$;
    create trigger test_fail before insert on visits for each row execute function pg_temp.fail_visit();`);
  await asUser();
  await db.exec("savepoint atomic");
  await assert.rejects(start(id(1),true,first), code("23514"));
  await db.exec("rollback to atomic");
  const old = await db.query<{status:string}>("select status from visits where id=$1",[first]);
  assert.equal(old.rows[0].status,"active");
  assert.equal((await db.query<{quantity:number}>("select quantity from cart_items where visit_id=$1",[first])).rows[0].quantity,2);
});

test("DB-05 selection records stay with the old visit after explicit re-entry", async () => {
  await asUser();
  const first = await start();
  await owner();
  const selection = await db.query<{id:string}>("insert into selections(visit_id,cart_version,rule_version) values ($1,0,1) returning id",[first]);
  await db.query("insert into selection_items(selection_id,slot,placement_type,product_id,rank,reason_code,reason_text) values ($1,1,'organic',$2,1,'popular','検証用の通常推薦')",[selection.rows[0].id,id(5)]);
  await asUser();
  const next = await start(id(1),true,first);
  await owner();
  assert.equal((await db.query("select * from selections where visit_id=$1",[first])).rows.length,1);
  assert.equal((await db.query("select * from selections where visit_id=$1",[next])).rows.length,0);
  assert.equal((await db.query("select * from selection_items where selection_id=$1",[selection.rows[0].id])).rows.length,1);
  const fresh = await db.query<{assignment_id:string|null;experiment_arm:string|null}>("select assignment_id,experiment_arm from visits where id=$1",[next]);
  assert.deepEqual(fresh.rows[0],{assignment_id:null,experiment_arm:null});
});

test("App's real transport reads DB-02 nullable branch/price and DB-03 cart via RPC", async () => {
  const client = databaseClient();
  await client.auth.signInWithPassword({email:"one@example.test",password:"test-only"});
  const opened=await startShoppingVisit(client,{storeId:id(1),startNew:false,previousVisitId:null});
  assert.equal(opened.stores[0].branch_name,null);
  await owner();
  await db.query("insert into cart_items(visit_id,product_id,quantity) values ($1,$2,2)",[opened.visit!.id,id(5)]);
  const restored=await loadShoppingContext(client,opened.visit!.id);
  assert.equal(restored.cart[0].code,"0123456789012");
  assert.equal(restored.cart[0].price,248);
  assert.equal(restored.cart[0].quantity,2);
  assert.equal((await loadShoppingContext(client,id(999))).visit,null);
  const otherStore=await startShoppingVisit(client,{storeId:id(2),startNew:false,previousVisitId:null});
  await owner();
  await db.query("insert into cart_items(visit_id,product_id,quantity) values ($1,$2,1)",[otherStore.visit!.id,id(5)]);
  assert.equal((await loadShoppingContext(client,otherStore.visit!.id)).cart[0].price,298);
});

test("two App clients restore only their own carts with official DB-06 RLS", async () => {
  const clients = [databaseClient(3),databaseClient(4)];
  for (const client of clients) await client.auth.signInWithPassword({email:"fictional@example.test",password:"test-only"});
  const visits = await Promise.all(clients.map(client=>startShoppingVisit(client,{storeId:id(1),startNew:false,previousVisitId:null})));
  assert.notEqual(visits[0].visit!.id,visits[1].visit!.id);
  for(let i=0;i<clients.length;i++) await db.query("insert into cart_items(visit_id,product_id,quantity) values ($1,$2,$3)",[visits[i].visit!.id,id(5),i+2]);
  for(let i=0;i<clients.length;i++) {
    const own=await loadShoppingContext(clients[i],visits[i].visit!.id);
    assert.equal(own.userId,id(i+3));
    assert.equal(own.cart[0].quantity,i+2);
    assert.deepEqual(await loadShoppingContext(clients[i],visits[i].visit!.id),own);
    const foreign=await loadShoppingContext(clients[i],visits[1-i].visit!.id);
    assert.equal(foreign.visit,null);
    assert.deepEqual(foreign.cart,[]);
    for(const table of ["visits","cart_items"]) {
      const result=await clients[i].from(table).select(table==="visits"?"id":"visit_id").eq(table==="visits"?"id":"visit_id",visits[1-i].visit!.id);
      assert.equal(result.error,null);
      assert.deepEqual(result.data,[]);
    }
  }
  await clients[0].auth.signOut({scope:"local"});
  await assert.rejects(loadShoppingContext(clients[0],visits[0].visit!.id),error=>error instanceof BackendError&&error.code==="unauthenticated");
});
