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
