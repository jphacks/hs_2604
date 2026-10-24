import {readFile} from "node:fs/promises";
import {createPortalDatabase,id,token,users} from "./portal-database.mts";
export const metricId=(prefix:string,n:number)=>prefix+"0000000-0000-4000-8000-"+String(n).padStart(12,"0");
/** DB-09の既存の架空データを正式migration/RLSのDBへ投入。HTTPだけを模擬する。 */
export async function createResultsDatabase(){
 const f=await createPortalDatabase();
 let sql=(await readFile(new URL("../../../kago-core/supabase/tests/db09.sql",import.meta.url),"utf8")).split("-- Real API role")[0];
 // 共存する募集ポータルの固定例は変更せず、DB-09自身の申請だけを審査済みにする。
 sql=sql.replace(/^update public\.ad_applications set.*;$/m,line=>line.slice(0,-1)+" where id in (pg_temp.db09_id('b',1),pg_temp.db09_id('b',2),pg_temp.db09_id('b',3));");
 await f.db.exec(sql+"\ncommit;");
 await f.db.query("insert into maker_members(maker_id,user_id) values ($1,$2),($3,$4)",[metricId("7",1),id(101),metricId("7",2),id(102)]);
 await f.db.exec(`
   insert into auth.users(id,email) values ('${metricId("1",32)}','second-device@example.test');
   insert into signage_devices(id,store_id,auth_user_id,slug,location)
     values ('${metricId("d",2)}','${metricId("2",1)}','${metricId("1",32)}','results-second-device','棚');
   insert into signage_plays(id,device_id,ad_placement_id,creative_version_id,mode,reason_code,started_at,ended_at,data_origin)
     values ('${metricId("0",99)}','${metricId("d",2)}','${metricId("c",1)}','${metricId("a",1)}','schedule','schedule','2026-10-22T17:30:00+09','2026-10-22T17:30:15+09','operated');
 `);
 const columns:Record<string,string[]>={
  ad_placements:["id","application_id","store_id","creative_version_id","channels","starts_at","ends_at","status","approved_at"],
  creative_versions:["id","creative_id","version","headline"],
  creatives:["id","product_id"],
  stores:["id","slug","name","branch_name","timezone"],
  products:["id","name"],
  ad_calls:["id","title","disclosure_scope"],
 };
 const json=(data:unknown,status=200)=>new Response(JSON.stringify(data,(_,v)=>typeof v==="bigint"?Number(v):v),{status,headers:{"content-type":"application/json","x-supabase-api-version":"2024-01-01"}});
 const rpcCalls:{name:string;args:Record<string,unknown>}[]=[];
 const fetcher:typeof fetch=async(input,init)=>{
  const url=new URL(String(input)),name=url.pathname.split("/").pop()!;
  if(!url.pathname.startsWith("/rest/v1/") || (!columns[name] && !url.pathname.includes("/rpc/")))return f.fetcher(input,init);
  const bearer=new Headers(init?.headers).get("authorization")?.replace(/^Bearer /i,"");
  const user=users.find(u=>token(u)===bearer);
  if(!user || f.expired.has(id(user.n)))return json({code:"session_not_found"},401);
  try{
   if(url.pathname.includes("/rpc/")){
    if(!["kago_app_metrics","kago_signage_metrics"].includes(name))return json({code:"PGRST202"},404);
    const args=JSON.parse(String(init?.body));rpcCalls.push({name,args});
    const result=await f.asUser(user,()=>f.db.query("select * from public."+name+"($1,$2,$3)",[args.p_start,args.p_end,args.p_store_id]));
    return json(result.rows);
   }
   if((init?.method??"GET")!=="GET")return json({code:"42501"},403);
   const allowed=(key:string)=>{if(!columns[name].includes(key))throw new Error("Unexpected column");return key;};
   const select=(url.searchParams.get("select")??"").split(",").map(allowed).join(",");
   const params:string[]=[],where:string[]=[];
   for(const [key,value] of url.searchParams){
    if(["select","order"].includes(key))continue;
    const col=allowed(key);
    if(value.startsWith("in.(")){
     where.push(col+" in ("+value.slice(4,-1).split(",").map(v=>{params.push(v);return "$"+params.length;}).join(",")+")");
    }else if(value.startsWith("eq.")){params.push(value.slice(3));where.push(col+"=$"+params.length);}
    else throw new Error("Unexpected filter");
   }
   const order=(url.searchParams.get("order")??"").split(",").filter(Boolean).map(v=>{const [k,dir]=v.split(".");return allowed(k)+(dir==="desc"?" desc":" asc");}).join(",");
   const result=await f.asUser(user,()=>f.db.query("select "+select+" from "+name+(where.length?" where "+where.join(" and "):"")+(order?" order by "+order:""),params));
   return json(result.rows);
  }catch(e){return json({code:(e as {code?:string}).code??"fixture_error",message:"fixture query rejected"},400);}
 };
 return {...f,fetcher,rpcCalls};
}
