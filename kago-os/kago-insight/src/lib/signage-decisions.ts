import "server-only";
import { USING_MOCK } from "./mode";
import { requireStoreSession } from "./store";

export type SignageDecision = {
 play_id:string;device_id:string;recorded_at:string;
 decision:{policy_version:string;selected_at:string;selected_key:string|null;reason_code:string;reason_text:string;
 weights:{key:string;weight:number}[];
 snapshot:{sample_size:number;observed_at:string;expires_at:string;categories:{category:string;visits:number}[]}|null};
};
export async function fetchSignageDecisions():Promise<{rows:SignageDecision[];unavailable:boolean}>{
 if(USING_MOCK)return {rows:[],unavailable:false};
 const {client,store}=await requireStoreSession();
 const {data,error}=await client.from("signage_decisions").select("play_id,device_id,decision,recorded_at")
  .eq("store_id",store.id).order("selected_at",{ascending:false}).order("play_id").limit(100);
 if(error){
  if(["42P01","PGRST205"].includes(error.code))return {rows:[],unavailable:true};
  throw new Error("サイネージの選定履歴を取得できません。接続と自店への所属を確認してください。");
 }
 return {rows:(data??[]) as SignageDecision[],unavailable:false};
}
