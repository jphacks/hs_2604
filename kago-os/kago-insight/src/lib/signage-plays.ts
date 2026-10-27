import "server-only";
import { USING_MOCK } from "./mode";
import { requireStoreSession } from "./store";

export type SignagePlayHistory = {
 id:string;device_id:string;ad_placement_id:string|null;promotion_version_id:string|null;creative_version_id:string|null;
 started_at:string;ended_at:string;mode:string;reason_code:string;end_reason:string;data_origin:string;
};
/** RLSに加え、解決済みの自店に属する端末だけを明示的に絞る。 */
export async function fetchSignagePlays():Promise<SignagePlayHistory[]> {
 if(USING_MOCK)return [];
 const {client,store}=await requireStoreSession();
 const devices=await client.from("signage_devices").select("id").eq("store_id",store.id);
 if(devices.error)throw new Error("サイネージ端末の情報を取得できません。接続と自店への所属を確認してください。");
 if(!devices.data?.length)return [];
 const result=await client.from("signage_plays")
  .select("id,device_id,ad_placement_id,promotion_version_id,creative_version_id,started_at,ended_at,mode,reason_code,end_reason,data_origin")
  .in("device_id",devices.data.map(d=>d.id)).order("started_at",{ascending:false}).order("id").limit(100);
 if(result.error)throw new Error("サイネージの再生履歴を取得できません。接続と自店への所属を確認してください。");
 return (result.data??[]) as SignagePlayHistory[];
}
