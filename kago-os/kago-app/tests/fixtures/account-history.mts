import type { createCartDatabase } from "./cart-database.mts";
import { id } from "./cart-database.mts";

export async function seedAccountHistory(database: Awaited<ReturnType<typeof createCartDatabase>>) {
  const { db } = database;
  const at = (await db.query<{at:string}>("select to_char(now() - interval '1 day', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as at")).rows[0].at;
  async function order(n:number, user:number, store:number, name:string, time=at) {
    await db.query("insert into visits(id,user_id,store_id,status,started_at,ended_at,last_activity_at) values ($1,$2,$3,'completed',$4::timestamptz-interval '1 hour',$4,$4)",[id(n+1000),id(user),id(store),time]);
    await db.query("insert into orders(id,visit_id,user_id,store_id,ordered_at,total,idempotency_key,cart_version,data_origin) values ($1,$2,$3,$4,$5,240,$6,1,'seeded')",[id(n),id(n+1000),id(user),id(store),time,id(n+2000)]);
    await db.query("insert into order_items(order_id,product_id,product_name,unit_price,quantity) values ($1,$2,$3,120,2)",[id(n),id(20),name]);
  }
  // Equal timestamps exercise the ID tie-breaker across page boundaries.
  for(let n=0;n<12;n++)await order(300+n,3,1,"購入時ミルク");
  await order(320,3,2,"別店舗の購入品");
  await order(321,4,1,"別利用者の購入品");
  const future=(await db.query<{at:string}>("select to_char(now() + interval '1 day', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as at")).rows[0].at;
  await order(322,3,1,"未来の購入品",future);
  await db.query("insert into visits(id,user_id,store_id) values ($1,$2,$3)",[id(16),id(4),id(2)]);
  await database.rpc("app_set_cart_item",[id(13),id(2500),id(20),2,0,"manual",null]);
}
