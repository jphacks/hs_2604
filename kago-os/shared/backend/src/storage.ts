import type { SupabaseClient } from "@supabase/supabase-js";

export const AD_IMAGE_BUCKET = "ad-images";
export const AD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const pathPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(png|jpg|webp)$/;

type AdImageErrorCode = "invalid_image" | "invalid_path" | "upload_failed" | "read_failed";
export class AdImageError extends Error {
  readonly code: AdImageErrorCode;
  constructor(code: AdImageErrorCode) {
    super(code);
    this.code = code;
    this.name = "AdImageError";
  }
}

// Client validation complements Storage's server-side MIME/size restrictions.
// This checks signatures, not a complete decoder or virus scanner.
export async function validateAdImage(file: Blob): Promise<"png" | "jpg" | "webp"> {
  if (file.size === 0 || file.size > AD_IMAGE_MAX_BYTES) throw new AdImageError("invalid_image");
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const matches = (bytes: number[], start = 0) => bytes.every((v, i) => b[start + i] === v);
  if (file.type === "image/png" && matches([137, 80, 78, 71, 13, 10, 26, 10])) return "png";
  if (file.type === "image/jpeg" && matches([255, 216, 255])) return "jpg";
  if (file.type === "image/webp" && matches([82, 73, 70, 70]) && matches([87, 69, 66, 80], 8)) return "webp";
  throw new AdImageError("invalid_image");
}

/** Use a signed-in maker client. The DB verifies membership and creative ownership. */
export async function uploadAdImage(client: SupabaseClient, makerId: string, creativeId: string, file: Blob) {
  if (!uuid.test(makerId) || !uuid.test(creativeId)) throw new AdImageError("invalid_path");
  const extension = await validateAdImage(file);
  const imagePath = `${makerId}/${creativeId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage.from(AD_IMAGE_BUCKET).upload(imagePath, file, {
    upsert: false, contentType: file.type, cacheControl: "300",
  });
  if (error) throw new AdImageError("upload_failed");
  // Save this relative path in creative_versions.image_path; never persist a signed URL.
  return { imagePath };
}

/** Read through the caller's RLS permissions; refresh on expiry and clear on logout. */
export async function getAdImageUrl(client: SupabaseClient, imagePath: string) {
  if (!pathPattern.test(imagePath)) throw new AdImageError("invalid_path");
  const expiresIn = 300;
  const { data, error } = await client.storage.from(AD_IMAGE_BUCKET).createSignedUrl(imagePath, expiresIn);
  if (error || !data?.signedUrl) throw new AdImageError("read_failed");
  return { url: data.signedUrl, expiresIn };
}

export type AdImageChannel = "app" | "signage";
export type AdImagePaths = Partial<Record<AdImageChannel, string>>;

/** Permission/network errors never become legacy content. Batch below PostgREST's row limit. */
export async function getAdMediaPaths(client: Parameters<typeof getAdImageUrl>[0],
  versions: {id:string;image_path:string}[], channels: AdImageChannel[] = ["app","signage"]):
  Promise<{supported:boolean;paths:Map<string,AdImagePaths>}> {
  if(versions.length>200){
    const batches=await Promise.all(Array.from({length:Math.ceil(versions.length/200)},(_,i)=>
      getAdMediaPaths(client,versions.slice(i*200,(i+1)*200),channels)));
    return {supported:batches.every(b=>b.supported),paths:new Map(batches.flatMap(b=>[...b.paths]))};
  }
  const {data,error}=await client.rpc("kago_ad_media_paths",{p_version_ids:versions.map(v=>v.id),p_channels:channels});
  if(error) {
    if(error.code!=="PGRST202") throw error;
    const paths=new Map(versions.map(v=>[v.id,Object.fromEntries(channels.map(c=>[c,v.image_path])) as AdImagePaths]));
    if(versions.length){
      // A stale API function cache does not mean new rows use the old shared image.
      const probe=await client.from("creative_versions").select("id,image_paths").in("id",versions.map(v=>v.id));
      if(probe.error&&!["42703","PGRST204"].includes(probe.error.code))throw probe.error;
      if(!probe.error){
        const rows=(probe.data??[]) as {id:string;image_paths:AdImagePaths|null}[];
        paths.clear();
        for(const row of rows){
          const legacy=versions.find(v=>v.id===row.id)?.image_path;
          const source=row.image_paths??Object.fromEntries(channels.map(c=>[c,legacy]));
          paths.set(row.id,Object.fromEntries(channels.filter(c=>typeof source[c]==="string").map(c=>[c,source[c]])) as AdImagePaths);
        }
      }
    }
    return {supported:false,paths};
  }
  const paths=new Map<string,AdImagePaths>(versions.map(v=>[v.id,{}]));
  for(const row of (data??[]) as {version_id:string;channel:AdImageChannel;image_path:string}[]) {
    if(paths.has(row.version_id)&&channels.includes(row.channel))paths.get(row.version_id)![row.channel]=row.image_path;
  }
  return {supported:true,paths};
}
