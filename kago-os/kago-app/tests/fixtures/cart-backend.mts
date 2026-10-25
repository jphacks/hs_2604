// Real migration/RLS/RPC execution; only Auth and PostgREST HTTP are test adapters.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createCartDatabase, id } from "./cart-database.mts";
import { seedAccountHistory } from "./account-history.mts";
import { seedOffers } from "./offers.mts";

export async function createCartBackend({ accountHistory = false, offers = false, demoUsers = false } = {}) {
  const database = await createCartDatabase();
  if(demoUsers) await database.db.query("insert into auth.users(id,email) values ($1,'yui.suzuki@example.test')",[id(6)]);
  if (accountHistory) await seedAccountHistory(database);
  if (offers) await seedOffers(database);
  const revoked = new Set<string>();
  const calls: { name: string; body: Record<string, unknown>; method?: string; query?: string }[] = [];
  const user = (n: number) => ({ id:id(n), aud:"authenticated", role:"authenticated", email:`user${n}@example.test`,
    created_at:"2026-10-24T00:00:00Z", app_metadata:{kago:{roles:[n === 5 ? "maker_staff" : "customer"]}}, user_metadata:{} });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!,"http://fixture");
    const send = (data: unknown,status=200) => { res.writeHead(status,{"Content-Type":"application/json","X-Supabase-Api-Version":"2024-01-01"});res.end(JSON.stringify(data)); };
    try {
      const chunks: Buffer[]=[];for await(const chunk of req)chunks.push(chunk);
      const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
      if(url.pathname.endsWith("/token")) {
        const demo:Record<string,string>={"misaki.sato@example.test":"3","ken.tanaka@example.test":"4","yui.suzuki@example.test":"6"};
        const n=/^user([345])@example\.test$/.exec(body.email ?? "")?.[1]??(demoUsers?demo[body.email]:undefined);
        if(!n || body.password!=="fixture-password")return send({code:"invalid_credentials",msg:"Invalid test credentials"},400);
        const token=[{alg:"HS256",typ:"JWT"},{sub:id(Number(n)),jti:randomUUID(),exp:Math.floor(Date.now()/1000)+3600}].map(v=>Buffer.from(JSON.stringify(v)).toString("base64url")).join(".")+".fixture";
        return send({access_token:token,refresh_token:randomUUID(),expires_in:3600,token_type:"bearer",user:user(Number(n))});
      }
      const token=(req.headers.authorization??"").replace(/^Bearer /,"");
      let n:number;
      try { n=Number(JSON.parse(Buffer.from(token.split(".")[1],"base64url").toString()).sub.slice(-12)); } catch { return send({code:"bad_jwt",msg:"No test session"},401); }
      if(revoked.has(token))return send({code:"bad_jwt",msg:"Revoked test session"},401);
      if(url.pathname.endsWith("/logout")){revoked.add(token);res.writeHead(204);return res.end();}
      if(url.pathname.endsWith("/user"))return send(user(n));
      const name=url.pathname.split("/").at(-1)!;
      if(!url.pathname.includes("/rpc/")) calls.push({name,body,method:req.method,query:url.search});
      if(url.pathname.includes("/rpc/")) {
        calls.push({name,body});
        const params: Record<string,string[]>={
          app_start_visit:["p_store_id","p_start_new","p_previous_visit_id"],
          app_get_cart:["p_visit_id"],
          app_list_products:["p_visit_id","p_query","p_offset"],
          app_lookup_product:["p_visit_id","p_request_id","p_code","p_product_id","p_failure_reason"],
          app_set_cart_item:["p_visit_id","p_request_id","p_product_id","p_quantity","p_expected_cart_version","p_source","p_selection_item_id"],
          app_list_offers:["p_visit_id"],
          app_claim_offer:["p_visit_id","p_request_id","p_offer_id","p_expected_cart_version"],
          app_record_offer_event:["p_visit_id","p_event_id","p_offer_id","p_event_type"],
          app_selection_candidates:["p_visit_id"],
          kago_save_selection:["p_visit_id","p_cart_version","p_rule_version","p_items","p_selection_id"],
          kago_checkout:["p_visit_id","p_idempotency_key","p_expected_cart_version","p_expected_total"],
        };
        if(!params[name])throw Error("Unknown RPC");
        const result=await database.rpc(name,params[name].map(p=>body[p]??null),n,n===5?"maker_staff":"customer");
        return send(name==="kago_checkout"?[result]:result);
      }
      const rows=await database.as(n,async()=>{
        if(name==="stores")return (await database.db.query("select id,slug,name,branch_name from stores where ($1::uuid is null or id=$1) order by name",[url.searchParams.get("id")?.slice(3)??null])).rows;
        if(name==="visits")return (await database.db.query("select id,store_id,status,cart_version,started_at from visits where user_id=auth.uid() and ($1::uuid is null or id=$1) and ($2::text is null or status=$2) order by started_at desc",[url.searchParams.get("id")?.slice(3)??null,url.searchParams.get("status")?.slice(3)??null])).rows;
        if(name==="events" && req.method==="POST") {
          await database.db.query(`insert into events(event_id,event_type,schema_version,occurred_at,store_id,user_id,visit_id,channel,data_origin,selection_item_id,product_id,payload)
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`, [body.event_id,body.event_type,body.schema_version,body.occurred_at,body.store_id,body.user_id,body.visit_id,body.channel,body.data_origin,body.selection_item_id,body.product_id,JSON.stringify(body.payload)]);
          return [];
        }
        if(name==="customer_settings") {
          const columns="use_purchase_history,use_current_cart,to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as updated_at";
          if(req.method==="POST")return (await database.db.query(`insert into customer_settings(user_id,use_purchase_history,use_current_cart) values ($1,$2,$3) returning ${columns}`,[body.user_id,body.use_purchase_history??false,body.use_current_cart??false])).rows;
          if(req.method==="PATCH") {
            const key=Object.keys(body)[0];if(!["use_purchase_history","use_current_cart"].includes(key))throw Error("Unknown setting");
            return (await database.db.query(`update customer_settings set ${key}=$1 where user_id=$2 and ($3::timestamptz is null or updated_at=$3) returning ${columns}`,[body[key],url.searchParams.get("user_id")?.slice(3),url.searchParams.get("updated_at")?.slice(3)??null])).rows;
          }
          return (await database.db.query(`select ${columns} from customer_settings where user_id=$1`,[url.searchParams.get("user_id")?.slice(3)])).rows;
        }
        if(name==="orders") {
          if(url.searchParams.has("visit_id"))return (await database.db.query(`select o.id,o.visit_id,o.store_id,o.ordered_at,o.total,o.data_origin,
            (select coalesce(jsonb_agg(jsonb_build_object('product_id',i.product_id,'product_name',i.product_name,'unit_price',i.unit_price,'quantity',i.quantity)),'[]'::jsonb) from order_items i where i.order_id=o.id) as order_items,
            (select coalesce(jsonb_agg(jsonb_build_object('product_id',d.product_id,'amount',d.amount)),'[]'::jsonb) from order_discounts d where d.order_id=o.id) as order_discounts
            from orders o where o.user_id=$1 and o.visit_id=$2`,[url.searchParams.get("user_id")?.slice(3),url.searchParams.get("visit_id")?.slice(3)])).rows;
          const cursor=url.searchParams.get("or");
          const match=cursor?.match(/^\(ordered_at\.lt\.([^,]+),and\(ordered_at\.eq\.([^,]+),id\.lt\.([\w-]+)\)\)$/);
          if(cursor&&!match)throw Error("Unexpected history cursor");
          return (await database.db.query(`select o.id,o.store_id,to_char(o.ordered_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as ordered_at,o.total,o.data_origin,
            (select coalesce(jsonb_agg(jsonb_build_object('product_id',i.product_id,'product_name',i.product_name,'unit_price',i.unit_price,'quantity',i.quantity)), '[]'::jsonb) from order_items i where i.order_id=o.id) as order_items
            from orders o where o.user_id=$1 and ($2::uuid is null or o.store_id=$2) and o.ordered_at<$3::timestamptz
            and ($4::timestamptz is null or (o.ordered_at,o.id)<($4::timestamptz,$5::uuid))
            order by o.ordered_at desc,o.id desc limit $6`,[url.searchParams.get("user_id")?.slice(3),url.searchParams.get("store_id")?.slice(3)??null,url.searchParams.get("ordered_at")?.slice(3),match?.[1]??null,match?.[3]??null,Number(url.searchParams.get("limit")??11)])).rows;
        }
        if(name==="selection_items")return (await database.db.query("select id,slot,product_id,selection_id from selection_items where ($1::uuid is null or selection_id=$1) and ($2::uuid is null or id=$2) order by slot",[url.searchParams.get("selection_id")?.slice(3)??null,url.searchParams.get("id")?.slice(3)??null])).rows;
        if(name==="selections")return (await database.db.query("select id,visit_id from selections where id=$1",[url.searchParams.get("id")?.slice(3)])).rows;
        if(name==="cart_items")return (await database.db.query("select product_id,quantity from cart_items where visit_id=$1",[url.searchParams.get("visit_id")?.slice(3)])).rows;
        if(name==="products")return (await database.db.query("select id,code,name,category from products")).rows;
        if(name==="store_products")return (await database.db.query("select product_id,price from store_products where store_id=$1",[url.searchParams.get("store_id")?.slice(3)])).rows;
        throw Error("Unknown table");
      },n===5?"maker_staff":"customer");
      return send(req.headers.accept?.includes("application/vnd.pgrst.object+json") ? rows[0]??null : rows);
    } catch(error) {const e=error as {code?:string;detail?:string};return send({code:e.code??"XX000",details:e.detail,message:"Test database rejected request"},400);}
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();if(!address||typeof address==="string")throw Error("No fixture port");
  return {...database,calls,url:`http://127.0.0.1:${address.port}`,
    close:async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await database.db.close();}};
}
