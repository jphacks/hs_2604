import type {FeedItem,SignageFeed} from "./feed";
import {playableItems} from "./player";
export const CROWD_POLICY_VERSION="sig06-crowd-v1";
export const CROWD_MIN_SAMPLE=5;
export const CROWD_MAX_AGE_MS=5*60*1000;
export type CrowdSnapshot={
 schema_version:1;store_id:string;data_origin:"operated"|"seeded"|"synthetic";
 observed_at:string;expires_at:string;sample_size:number;
 categories:{category:string;visits:number}[];
};
export type CrowdDecision={
 policy_version:typeof CROWD_POLICY_VERSION;store_id:string;selected_at:string;
 selected_key:string|null;reason_code:"crowd_category"|"crowd_small"|"crowd_missing"|"crowd_invalid"|"crowd_expired"|"crowd_no_match"|"crowd_no_content";
 reason_text:string;weights:{key:string;weight:number}[];snapshot:CrowdSnapshot|null;
};
const messages:Record<CrowdDecision["reason_code"],string>={
 crowd_category:"店内の集計傾向に合う広告を選びました",
 crowd_small:"人数が少ないため、汎用のご案内を表示します",
 crowd_missing:"集計がないため、汎用のご案内を表示します",
 crowd_invalid:"集計を利用できないため、汎用のご案内を表示します",
 crowd_expired:"集計の有効期限が切れたため、汎用のご案内を表示します",
 crowd_no_match:"集計に合う有効な広告がないため、汎用のご案内を表示します",
 crowd_no_content:"表示できる広告がないため、汎用のご案内を表示します",
};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
function parse(raw:unknown,storeId:string,allowed:Set<string>):CrowdSnapshot|null{
 if(!object(raw)||!exact(raw,["schema_version","store_id","data_origin","observed_at","expires_at","sample_size","categories"]))return null;
 if(raw.schema_version!==1||raw.store_id!==storeId||!["operated","seeded","synthetic"].includes(String(raw.data_origin)))return null;
 if(typeof raw.observed_at!=="string"||typeof raw.expires_at!=="string"||!Number.isFinite(Date.parse(raw.observed_at))||!Number.isFinite(Date.parse(raw.expires_at)))return null;
 if(!Number.isSafeInteger(raw.sample_size)||Number(raw.sample_size)<0||Number(raw.sample_size)>100000||!Array.isArray(raw.categories)||raw.categories.length>100)return null;
 const categories:{category:string;visits:number}[]=[];
 for(const c of raw.categories){
  if(!object(c)||!exact(c,["category","visits"])||typeof c.category!=="string"||!allowed.has(c.category)||!Number.isSafeInteger(c.visits)||Number(c.visits)<0||Number(c.visits)>Number(raw.sample_size))return null;
  if(categories.some(x=>x.category===c.category))return null;
  categories.push({category:c.category,visits:Number(c.visits)});
 }
 return {schema_version:1,store_id:storeId,data_origin:raw.data_origin as CrowdSnapshot["data_origin"],observed_at:raw.observed_at,expires_at:raw.expires_at,sample_size:Number(raw.sample_size),categories:categories.sort((a,b)=>a.category<b.category?-1:a.category>b.category?1:0)};
}
/** 集計だけを受け取る決定的な選定。個人のかご・履歴・IDを受け取らず、不明なフィールドも記録へ転送しない。 */
export function selectCrowdAd(feed:SignageFeed,categoryByKey:Readonly<Record<string,string>>,raw:unknown,now:Date,ready:(item:FeedItem)=>boolean=()=>true):CrowdDecision{
 const base={policy_version:CROWD_POLICY_VERSION,store_id:feed.device.store_id,selected_at:now.toISOString()} as const;
 const fallback=(reason_code:CrowdDecision["reason_code"]):CrowdDecision=>({...base,selected_key:null,reason_code,reason_text:messages[reason_code],weights:[],snapshot:null});
 if(raw===null||raw===undefined)return fallback("crowd_missing");
 const snapshot=parse(raw,feed.device.store_id,new Set(Object.values(categoryByKey)));
 if(!snapshot)return fallback("crowd_invalid");
 const observed=Date.parse(snapshot.observed_at),end=Date.parse(snapshot.expires_at);
 if(observed>now.getTime()||end<=observed||end-observed>CROWD_MAX_AGE_MS)return fallback("crowd_invalid");
 if(now.getTime()>=end||now.getTime()-observed>=CROWD_MAX_AGE_MS)return fallback("crowd_expired");
 if(snapshot.sample_size<CROWD_MIN_SAMPLE)return fallback("crowd_small");
 const items=playableItems(feed,now.getTime(),ready).filter(i=>i.placement_type==="sponsored"&&!feed.suspended_keys.includes(i.key));
 if(!items.length)return fallback("crowd_no_content");
 const weights=items.map(i=>({key:i.key,weight:Math.round((snapshot.categories.find(c=>c.category===categoryByKey[i.key])?.visits??0)/snapshot.sample_size*1000000)/1000000}))
  .sort((a,b)=>b.weight-a.weight||(a.key<b.key?-1:a.key>b.key?1:0));
 if(!weights[0]?.weight)return {...fallback("crowd_no_match"),weights,snapshot};
 const chosen=weights[0];
 return {...base,selected_key:chosen.key,reason_code:"crowd_category",reason_text:categoryByKey[chosen.key]+"の傾向に合う、有効な広告を選びました",weights,snapshot};
}
