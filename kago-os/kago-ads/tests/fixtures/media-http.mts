import {createServer} from "node:http";
import {createPortalDatabase} from "./portal-database.mts";

/** Local-only Auth/PostgREST/Storage transport; SQL and RLS are the actual migrations. */
export async function createMediaHttp(){
 const fixture=await createPortalDatabase();
 const server=createServer(async(req,res)=>{
  try{
   const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value)headers.set(key,Array.isArray(value)?value.join(","):value);
   const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const bytes=Buffer.concat(chunks);
   const url="http://127.0.0.1"+req.url;
   let body:BodyInit|undefined=bytes.length?bytes.toString():undefined;
   if(headers.get("content-type")?.includes("multipart/form-data"))
    body=await new Request(url,{method:req.method,headers,body:bytes}).formData();
   if(req.method==="OPTIONS"){res.writeHead(204,{"access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"GET,POST,PATCH,OPTIONS"});res.end();return;}
   const response=await fixture.fetcher(url,{method:req.method,headers,body});
   res.writeHead(response.status,{...Object.fromEntries(response.headers),"access-control-allow-origin":"*"});
   res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){console.error("fixture transport:",req.method,req.url,(error as Error).message);res.writeHead(500,{"content-type":"application/json"});res.end(JSON.stringify({code:(error as {code?:string}).code??"fixture_error"}));}
 });
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
 const address=server.address();if(!address||typeof address==="string")throw new Error("Fixture did not start");
 return {fixture,url:"http://127.0.0.1:"+address.port,close:async()=>{await new Promise<void>(r=>server.close(()=>r()));await fixture.close();}};
}
