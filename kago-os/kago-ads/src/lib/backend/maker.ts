import { AdImageError, BackendError, getAdImageUrl, uploadAdImage, validateAdImage } from "@kago/backend";
import { ValidationError, type AdsRepository, type ApplicationInput, type CreativeInput, type CreativeVersionInput, type CreativeWithVersions } from "../data/repository.ts";
import { canResubmit, validateApplication } from "../domain/rules.ts";
import { CHANNELS, type AdApplication, type AdPlacement, type ApplicationRevision, type Creative, type CreativeVersion, type MediaAsset, type Session } from "../domain/types.ts";
import { createSupabasePortalRepository, portalError, requireMaker, type PortalClient } from "./portal.ts";

export type MakerRepository = Pick<AdsRepository, "listStores" | "listMakers" | "listProducts" | "getAdCall" | "listMyCreatives" | "listMyApplications" | "getApplication" | "listPlacements"> & {
  createCreative(session: Session, input: CreativeInput, requestId?: string): Promise<CreativeWithVersions>;
  addCreativeVersion(session: Session, id: string, input: CreativeVersionInput, requestId?: string): Promise<CreativeVersion>;
  submitApplication(session: Session, callId: string, input: ApplicationInput): Promise<AdApplication>;
  resubmitApplication(session: Session, id: string, input: ApplicationInput, expectedUpdatedAt?: string): Promise<AdApplication>;
};
export type VersionRow = { id: string; creative_id: string; version: number; image_path: string; headline: string; note: string | null; created_at: string };
export type RevisionRow = { application_id: string; revision: number; creative_version_id: string; channels: ApplicationRevision["channels"]; requested_period: string; message: string | null; submitted_at: string; status: ApplicationRevision["status"]; review_comment: string | null; reviewed_at: string | null };
export type ApplicationRow = { id: string; ad_call_id: string; store_id: string; maker_id: string; creative_id: string; creative_version_id: string; channels: AdApplication["channels"]; requested_period: string; revision: number; status: AdApplication["status"]; review_comment: string | null; created_at: string; updated_at: string };
const creativeColumns = "id,maker_id,product_id,created_at";
const versionColumns = "id,creative_id,version,image_path,headline,note,created_at";
const appColumns = "id,ad_call_id,store_id,maker_id,creative_id,creative_version_id,channels,requested_period,revision,status,review_comment,created_at,updated_at";
const revisionColumns = "application_id,revision,creative_version_id,channels,requested_period,message,submitted_at,status,review_comment,reviewed_at";
const placementColumns = "id,application_id,store_id,creative_version_id,channels,starts_at,ends_at,status,approved_by,approved_at,suspend_reason,suspended_by,suspended_at";
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const conflict = () => new Error("他の操作で更新されています。再読み込みして最新の状態を確認してください。");
export function makerError(error: unknown): Error {
  if (error instanceof AdImageError) return new Error(error.code === "invalid_image"
    ? "PNG・JPEG・WebPの画像を5MiB以下で選んでください。動画は登録できません。"
    : "広告画像を保存・取得できませんでした。画像保存先の設定と権限を確認してください。");
  const code = (error as { code?: string })?.code;
  if (code === "23505") return new Error("同じ素材の申請、または同じ版がすでに保存されています。一覧を再読み込みしてください。");
  if (code === "23514") return new Error("募集・申請・素材の状態が変わっています。再読み込みして期間・掲載先・版を確認してください。");
  if (code === "23503") return new Error("対象商品が募集店舗で取り扱われているか、選択した素材の版を確認してください。");
  return portalError(error);
}
/** PostgRESTの有限・半開tstzrangeを、時差を保った瞬間へ正規化する。 */
export function parseRequestedPeriod(value: string) {
  const m = /^\[(?:"([^"]+)"|([^,]+)),(?:"([^"]+)"|([^,)]+))\)$/.exec(value);
  const start = m?.[1] ?? m?.[2], end = m?.[3] ?? m?.[4];
  if (!start || !end || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(start) >= Date.parse(end)) throw new Error("希望期間のDB形式を確認してください。");
  return { requested_start: new Date(start).toISOString(), requested_end: new Date(end).toISOString() };
}
export function requestedPeriod(start: string, end: string) {
  if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(start) >= Date.parse(end)) throw new ValidationError(["有効な希望期間を入力してください"]);
  return "[" + new Date(start).toISOString() + "," + new Date(end).toISOString() + ")";
}
export function mapApplication(row: ApplicationRow, revisions: RevisionRow[]): AdApplication {
  const rounds = revisions.filter(r => r.application_id === row.id).sort((a,b) => a.revision-b.revision);
  if (!rounds.length || rounds[rounds.length-1].revision !== row.revision) throw new Error("申請履歴を取得できません。DBの読取権限を確認してください。");
  return { id: row.id, ad_call_id: row.ad_call_id, store_id: row.store_id, maker_id: row.maker_id, creative_id: row.creative_id,
    creative_version_id: row.creative_version_id, channels: row.channels, ...parseRequestedPeriod(row.requested_period),
    status: row.status, review_comment: row.review_comment ?? undefined, created_at: row.created_at, updated_at: row.updated_at,
    revisions: rounds.map(r => ({ rev:r.revision, creative_version_id:r.creative_version_id, channels:r.channels,
      ...parseRequestedPeriod(r.requested_period), message:r.message ?? "", submitted_at:r.submitted_at, status:r.status,
      review_comment:r.review_comment ?? undefined, reviewed_at:r.reviewed_at ?? undefined })) };
}
function content(input: CreativeVersionInput) {
  const errors: string[] = [];
  if (!input.headline.trim()) errors.push("見出しを入力してください");
  if (input.note.trim().length > 500) errors.push("版のメモは500字以内にしてください");
  const assets = Object.values(input.assets).filter((a): a is MediaAsset => !!a);
  if (!assets.length || assets.some(a=>a.kind!=="image")) errors.push("画像を1枚選んでください。実接続では動画は使えません");
  if (new Set(assets.map(a=>a.storage_path ?? a.path)).size > 1) errors.push("1つの版には共通の画像を1枚だけ登録してください");
  if (errors.length) throw new ValidationError(errors);
  return { headline:input.headline.trim(), note:input.note.trim() || null, asset:assets[0] };
}
export function createSupabaseMakerRepository(client: PortalClient): MakerRepository {
  const portal = createSupabasePortalRepository(client);
  async function query<T>(load:PromiseLike<{data:unknown;error:unknown}>): Promise<T> {
    const {data,error}=await load;if(error)throw makerError(error);return data as T;
  }
  async function makerOf(session:Session) {
    const identity=await requireMaker(client);
    if(session.role!=="maker_staff" || !identity.makerIds.includes(session.makerId))throw new BackendError("forbidden");
    return session.makerId;
  }
  async function creativeOf(session:Session,id:string) {
    const maker=await makerOf(session);
    if(!uuid.test(id))throw new BackendError("forbidden");
    const row=await query<Creative|null>(client.from("creatives").select(creativeColumns).eq("id",id).eq("maker_id",maker).maybeSingle());
    if(!row)throw new BackendError("forbidden");return row;
  }
  async function mapVersion(row:VersionRow):Promise<CreativeVersion> {
    const base={id:row.id,creative_id:row.creative_id,version:row.version,headline:row.headline,note:row.note??"",created_at:row.created_at};
    try {
      const {url}=await getAdImageUrl(client,row.image_path);
      // DBは画素数・容量を持たない。0は未知を表す。表示枠の寸法はAdMediaが媒体から決める。
      const asset:MediaAsset={kind:"image",path:url,storage_path:row.image_path,width:0,height:0,bytes:0,file_name:row.image_path.split("/").pop()!};
      return {...base,assets:{app:asset,signage:asset}};
    }catch{return {...base,assets:{},image_error:"保存済み画像を取得できません。画像保存先の設定・権限を確認して再読み込みしてください。"};}
  }
  async function imageFor(maker:string,creative:string,asset:MediaAsset) {
    try {
      if(asset.upload) return (await uploadAdImage(client,maker,creative,asset.upload)).imagePath;
      if(!asset.storage_path?.startsWith(maker+"/"+creative+"/"))throw new BackendError("forbidden");
      await getAdImageUrl(client,asset.storage_path);
      return asset.storage_path;
    }catch(e){if(e instanceof BackendError)throw e;throw makerError(e);}
  }
  async function addVersion(session:Session,id:string,input:CreativeVersionInput,requestId=crypto.randomUUID()) {
    const creative=await creativeOf(session,id),v=content(input);
    if(!uuid.test(requestId))throw new ValidationError(["登録IDの形式を確認してください"]);
    if(v.asset.upload) {try{await validateAdImage(v.asset.upload);}catch(e){throw makerError(e);}}
    const existing=await query<VersionRow|null>(client.from("creative_versions").select(versionColumns).eq("id",requestId).eq("creative_id",id).maybeSingle());
    if(existing) {
      if(existing.headline!==v.headline || existing.note!==v.note)throw conflict();
      return mapVersion(existing);
    }
    const previous=await query<VersionRow[]>(client.from("creative_versions").select(versionColumns).eq("creative_id",id).order("version",{ascending:false}).limit(1));
    const image_path=await imageFor(creative.maker_id,id,v.asset);
    const row=await query<VersionRow>(client.from("creative_versions").insert({id:requestId,creative_id:id,version:(previous[0]?.version??0)+1,image_path,headline:v.headline,note:v.note}).select(versionColumns).single());
    return mapVersion(row);
  }
  async function applications(session:Session,id?:string) {
    const maker=await makerOf(session);
    if(id && !uuid.test(id))return [];
    let load=client.from("ad_applications").select(appColumns).eq("maker_id",maker).order("created_at",{ascending:false}).order("id");
    if(id)load=load.eq("id",id);
    const rows=await query<ApplicationRow[]>(load);
    if(!rows.length)return [];
    const revisions=await query<RevisionRow[]>(client.from("application_revisions").select(revisionColumns).in("application_id",rows.map(r=>r.id)).order("revision"));
    return rows.map(r=>mapApplication(r,revisions));
  }
  async function terms(session:Session,callId:string,input:ApplicationInput) {
    const maker=await makerOf(session),call=await portal.getAdCall(session,callId);
    if(!call)throw new ValidationError(["募集が見つからないか、下書きです"]);
    const version=await query<VersionRow|null>(client.from("creative_versions").select(versionColumns).eq("id",input.creative_version_id).maybeSingle());
    if(!version)throw new BackendError("forbidden");
    const creative=await creativeOf(session,version.creative_id);
    const mapped=await mapVersion(version);
    const errors=validateApplication(call,mapped,input);
    requestedPeriod(input.requested_start,input.requested_end);
    if(input.channels.some(c=>!CHANNELS.includes(c)) || new Set(input.channels).size!==input.channels.length)errors.push("掲載先を確認してください");
    if(input.message.trim().length>500)errors.push("メッセージは500字以内にしてください");
    const active=await query<{product_id:string}[]>(client.from("store_products").select("product_id").eq("store_id",call.store_id).eq("product_id",creative.product_id).eq("is_active",true));
    if(!active.length)errors.push("この商品は募集店舗で取り扱われていません");
    if(errors.length)throw new ValidationError(errors);
    return {maker,call,creative,version};
  }
  return {
    listStores:portal.listStores,getAdCall:portal.getAdCall,
    async listMakers(){await requireMaker(client);return query(client.from("makers").select("id,slug,display_name,is_fictional").order("display_name"));},
    async listProducts(){await requireMaker(client);return query(client.from("products").select("id,code,name,category").order("name"));},
    async listMyCreatives(session){
      const maker=await makerOf(session);
      const creatives=await query<Creative[]>(client.from("creatives").select(creativeColumns).eq("maker_id",maker).order("created_at",{ascending:false}).order("id"));
      if(!creatives.length)return [];
      const versions=await query<VersionRow[]>(client.from("creative_versions").select(versionColumns).in("creative_id",creatives.map(c=>c.id)).order("version"));
      const mapped=await Promise.all(versions.map(mapVersion));
      return creatives.map(creative=>({creative,versions:mapped.filter(v=>v.creative_id===creative.id)})).filter(c=>c.versions.length>0);
    },
    async createCreative(session,input,requestId=crypto.randomUUID()){
      const maker=await makerOf(session),v=content(input);
      if(!uuid.test(input.product_id)||!uuid.test(requestId))throw new ValidationError(["対象商品を選んでください"]);
      if(!v.asset.upload)throw new ValidationError(["登録する画像ファイルを選んでください"]);
      try{await validateAdImage(v.asset.upload);}catch(e){throw makerError(e);}
      let creative=await query<Creative|null>(client.from("creatives").select(creativeColumns).eq("id",requestId).eq("maker_id",maker).maybeSingle());
      if(creative && creative.product_id!==input.product_id)throw new Error("前回の登録と対象商品が異なります。登録画面を開き直してください。");
      if(!creative)creative=await query<Creative>(client.from("creatives").insert({id:requestId,maker_id:maker,product_id:input.product_id}).select(creativeColumns).single());
      const first=await query<VersionRow[]>(client.from("creative_versions").select(versionColumns).eq("creative_id",creative.id).order("version"));
      if(first.length) {
        if(first[0].headline!==v.headline || first[0].note!==v.note)throw conflict();
        return {creative,versions:await Promise.all(first.map(mapVersion))};
      }
      return {creative,versions:[await addVersion(session,creative.id,input)]};
    },
    addCreativeVersion:addVersion,
    listMyApplications:applications,
    async getApplication(session,id){return (await applications(session,id))[0];},
    async listPlacements(session,id){
      const app=(await applications(session,id))[0];if(!app)return [];
      return query<AdPlacement[]>(client.from("ad_placements").select(placementColumns).eq("application_id",app.id).order("approved_at",{ascending:false}).order("id"));
    },
    async submitApplication(session,callId,input){
      const t=await terms(session,callId,input);
      const row=await query<ApplicationRow>(client.from("ad_applications").insert({ad_call_id:t.call.id,store_id:t.call.store_id,maker_id:t.maker,creative_id:t.creative.id,creative_version_id:t.version.id,
        channels:[...input.channels],requested_period:requestedPeriod(input.requested_start,input.requested_end),message:input.message.trim()||null,status:"submitted",revision:1}).select(appColumns).single());
      return (await applications(session,row.id))[0];
    },
    async resubmitApplication(session,id,input,expectedUpdatedAt){
      const current=(await applications(session,id))[0];
      if(!current)throw new BackendError("forbidden");
      if(!canResubmit(current))throw new ValidationError(["審査中は再申請できません"]);
      if(expectedUpdatedAt && Date.parse(expectedUpdatedAt)!==Date.parse(current.updated_at))throw conflict();
      const t=await terms(session,current.ad_call_id,input);
      if(t.creative.id!==current.creative_id)throw new ValidationError(["再申請では同じ広告素材の版を選んでください"]);
      const revision=current.revisions[current.revisions.length-1].rev;
      const row=await query<ApplicationRow|null>(client.from("ad_applications").update({creative_version_id:t.version.id,channels:[...input.channels],
        requested_period:requestedPeriod(input.requested_start,input.requested_end),message:input.message.trim()||null,status:"submitted",revision:revision+1,
        review_comment:null,reviewed_by:null,reviewed_at:null}).eq("id",id).eq("maker_id",t.maker).eq("status",current.status).eq("revision",revision).eq("updated_at",current.updated_at).select(appColumns).maybeSingle());
      if(!row)throw conflict();
      return (await applications(session,id))[0];
    },
  };
}
