// Real migration/RLS/RPC execution; only Auth and PostgREST HTTP are test adapters.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createCartDatabase, id } from "./cart-database.mts";

export async function createCartBackend() {
  const database = await createCartDatabase();
  const revoked = new Set<string>();
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  const user = (n: number) => ({ id:id(n), aud:"authenticated", role:"authenticated", email:`user${n}@example.test`,
    created_at:"2026-10-24T00:00:00Z", app_metadata:{kago:{roles:[n === 5 ? "maker_staff" : "customer"]}}, user_metadata:{} });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!,"http://fixture");
    const send = (data: unknown,status=200) => { res.writeHead(status,{"Content-Type":"application/json","X-Supabase-Api-Version":"2024-01-01"});res.end(JSON.stringify(data)); };
    try {
      const chunks: Buffer[]=[];for await(const chunk of req)chunks.push(chunk);
      const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
      if(url.pathname.endsWith("/token")) {
        const n=/^user([345])@example\.test$/.exec(body.email ?? "")?.[1];
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
      if(url.pathname.includes("/rpc/")) {
        calls.push({name,body});
        const params: Record<string,string[]>={
          app_start_visit:["p_store_id","p_start_new","p_previous_visit_id"],
          app_get_cart:["p_visit_id"],
          app_list_products:["p_visit_id","p_query","p_offset"],
          app_lookup_product:["p_visit_id","p_request_id","p_code","p_product_id","p_failure_reason"],
          app_set_cart_item:["p_visit_id","p_request_id","p_product_id","p_quantity","p_expected_cart_version","p_source","p_selection_item_id"],
        };
        if(!params[name])throw Error("Unknown RPC");
        return send(await database.rpc(name,params[name].map(p=>body[p]??null),n,n===5?"maker_staff":"customer"));
      }
      const rows=await database.as(n,async()=>{
        if(name==="stores")return (await database.db.query("select id,slug,name,branch_name from stores order by name")).rows;
        if(name==="visits")return (await database.db.query("select id,store_id,cart_version,started_at from visits where user_id=auth.uid() and status='active' order by started_at desc")).rows;
        if(name==="cart_items")return (await database.db.query("select product_id,quantity from cart_items where visit_id=$1",[url.searchParams.get("visit_id")?.slice(3)])).rows;
        if(name==="products")return (await database.db.query("select id,code,name,category from products")).rows;
        if(name==="store_products")return (await database.db.query("select product_id,price from store_products where store_id=$1",[url.searchParams.get("store_id")?.slice(3)])).rows;
        throw Error("Unknown table");
      });
      return send(rows);
    } catch(error) {const e=error as {code?:string;detail?:string};return send({code:e.code??"XX000",details:e.detail,message:"Test database rejected request"},400);}
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();if(!address||typeof address==="string")throw Error("No fixture port");
  return {...database,calls,url:`http://127.0.0.1:${address.port}`,
    close:async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await database.db.close();}};
}
