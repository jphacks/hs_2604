// Local UI preview only: an isolated PGlite database, synthetic Auth, no shared Supabase.
import {spawn} from "node:child_process";
import {createCartBackend} from "../tests/fixtures/cart-backend.mts";
import {id} from "../tests/fixtures/cart-database.mts";
const fixture=await createCartBackend({accountHistory:false,offers:true});
const products=[
 ["PLU-1001","玉ねぎ","青果",108],["PLU-1002","りんご","青果",158],["PLU-1003","アボカド","青果",198],
 ["PLU-2001","じゃがいもコロッケ","惣菜",78],["PLU-2002","若鶏のからあげ","惣菜",358],["PLU-3001","焼きたて塩パン","パン",148],
] as const;
const productIds=new Map<string,string>();
for(const [n,p] of products.entries()){
 const saved=await fixture.db.query<{id:string}>("insert into products(id,code,name,category) values ($1,$2,$3,$4) on conflict(code) do update set name=excluded.name,category=excluded.category returning id",[id(90001+n),p[0],p[1],p[2]]);
 const productId=saved.rows[0].id;productIds.set(p[0],productId);
 for(const storeNumber of [1,2]) await fixture.db.query("insert into store_products(store_id,product_id,price,is_active) values ($1,$2,$3,true) on conflict(store_id,product_id) do update set price=excluded.price,is_active=true",[id(storeNumber),productId,p[3]]);
}

// Varied visual-only history. Keep the reusable test fixture's tie-breaker cases unchanged.
const baskets=[
 [["PLU-1002",2],["PLU-3001",1]],
 [["PLU-1001",3],["PLU-2001",2],["PLU-2002",1]],
 [["PLU-1003",2],["PLU-3001",2]],
 [["PLU-2002",1],["PLU-1002",1],["PLU-1001",2]],
 [["PLU-3001",3],["PLU-1002",2]],
] as const;
for(let n=0;n<12;n++){
 const orderId=id(300+n);
 const items=baskets[n%baskets.length];
 const at=new Date(Date.now()-(n*4+1)*86400000);
 at.setUTCHours([1,3,8,9,10][n%5], [12,35,18,46,5][n%5],0,0);
 const storeId=id(n%3===1?2:1);

 const totalForOrder=items.reduce((sum,[code,quantity])=>sum+products.find(p=>p[0]===code)![3]*quantity,0);
 await fixture.db.query("insert into visits(id,user_id,store_id,status,started_at,ended_at,last_activity_at) values ($1,$2,$3,'completed',$4::timestamptz-interval '35 minutes',$4,$4)",[id(1300+n),id(3),storeId,at.toISOString()]);
 await fixture.db.query("insert into orders(id,visit_id,user_id,store_id,ordered_at,total,idempotency_key,cart_version,data_origin) values ($1,$2,$3,$4,$5,$6,$7,1,'synthetic')",[orderId,id(1300+n),id(3),storeId,at.toISOString(),totalForOrder,id(2300+n)]);
 for(const [code,quantity] of items){
  const product=products.find(p=>p[0]===code)!;

  await fixture.db.query("insert into order_items(order_id,product_id,product_name,unit_price,quantity) values ($1,$2,$3,$4,$5)",[orderId,productIds.get(code),product[1],product[3],quantity]);
 }


}

const current=await fixture.rpc("app_get_cart",[id(13)]) as {visit:{cart_version:number}};
await fixture.rpc("app_set_cart_item",[id(13),id(99009),productIds.get("PLU-1002"),1,current.visit.cart_version,"manual",null]);
const port=process.env.KAGO_UI_PREVIEW_PORT??"3210";
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port",port],{
 env:{...process.env,KAGO_DEMO_ENABLED:"0",NEXT_PUBLIC_SUPABASE_URL:fixture.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test"},stdio:"inherit",windowsHide:true,
});
console.log("UI preview: http://localhost:"+port+"/App");
console.log("Synthetic login: user3@example.test / fixture-password");
let stopped=false;
async function stop(){if(stopped)return;stopped=true;server.kill();await fixture.close();}
process.on("SIGTERM",()=>void stop());process.on("SIGINT",()=>void stop());
server.once("exit",()=>void stop());
