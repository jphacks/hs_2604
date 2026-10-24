import type {SignageFeed,FeedItem} from "../../lib/signage/feed";
import type {CrowdSnapshot} from "../../lib/signage/crowd-selection";
export const CROWD_DEMO_NOW="2026-10-24T12:00:00+09:00";
export type CrowdScenario="pasta"|"bread"|"small"|"missing"|"expired"|"stopped"|"all_stopped";
export const CROWD_SCENARIOS:{id:CrowdScenario;label:string}[]=[
 {id:"pasta",label:"パスタ多め"},{id:"bread",label:"パン多め"},{id:"small",label:"少人数"},
 {id:"missing",label:"集計なし"},{id:"expired",label:"期限切れ"},{id:"stopped",label:"パスタ広告を停止"},{id:"all_stopped",label:"全広告を停止"},
];
export const CROWD_DEMO_CATEGORIES={PASTA:"パスタ",BREAD:"パン"};
export function crowdDemo(scenario:CrowdScenario):{feed:SignageFeed;snapshot:CrowdSnapshot|null}{
 const item=(key:string,name:string):FeedItem=>({key,placement_type:"sponsored",ad_placement_id:key,promotion_version_id:null,creative_version_id:key+"-V1",
  asset:{kind:"image",path:"/ad-assets/FALLBACK_v1_signage.png",width:1920,height:1080,bytes:0,file_name:"demo"},product_name:name,price:100,
  maker_name:"SIG-06架空メーカー",reason_code:"approved_order",valid_until:"2026-10-24T13:00:00+09:00"});
 const feed:SignageFeed={device:{id:"SIG06-D1",store_id:"SIG06-S1",slug:"sig06-demo",location:"確認用"},store_name:"SIG-06架空店舗",
  fetched_at:CROWD_DEMO_NOW,expires_at:"2026-10-24T12:10:00+09:00",clock_offset_ms:0,
  items:[item("PASTA","パスタの広告"),item("BREAD","パンの広告")],suspended_keys:scenario==="stopped"?["PASTA"]:scenario==="all_stopped"?["PASTA","BREAD"]:[],skipped:[]};
 const small=scenario==="small";
 const snapshot:CrowdSnapshot={schema_version:1,store_id:feed.device.store_id,data_origin:"synthetic",
  observed_at:CROWD_DEMO_NOW,expires_at:scenario==="expired"?CROWD_DEMO_NOW:"2026-10-24T12:05:00+09:00",
  sample_size:small?4:8,categories:[{category:"パスタ",visits:scenario==="bread"?2:small?3:6},{category:"パン",visits:scenario==="bread"?6:small?1:2}]};
 if(scenario==="expired")snapshot.observed_at="2026-10-24T11:55:00+09:00";
 return {feed,snapshot:scenario==="missing"?null:snapshot};
}
