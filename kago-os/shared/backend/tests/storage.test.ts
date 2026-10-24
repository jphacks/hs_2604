import assert from "node:assert/strict";
import test from "node:test";
import {
  AD_IMAGE_MAX_BYTES, AdImageError, createHeadlessBackend,
  getAdImageUrl, uploadAdImage, validateAdImage,
} from "../src/index.ts";

const maker = "70000000-0000-4000-8000-000000000001";
const creative = "90000000-0000-4000-8000-000000000001";
const asset = "a0000000-0000-4000-8000-000000000001";
const path = `${maker}/${creative}/${asset}.png`;
const png = new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jE2kAAAAASUVORK5CYII=", "base64")], { type: "image/png" });
const hasCode = (code: string) => (e: unknown) => e instanceof AdImageError && e.code === code;
function backend(failure = false) {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const client = createHeadlessBackend({ url: "https://demo.supabase.co", publishableKey: "sb_publishable_test" }, async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    requests.push({ url, init });
    if (failure) return Response.json({ message: "PRIVATE storage detail", statusCode: "403", error: "Forbidden" }, { status: 403 });
    if (url.pathname.includes("/object/sign/")) return Response.json({ signedURL: `/object/sign/ad-images/${path}?token=test` });
    return Response.json({ Key: `ad-images/${path}` });
  });
  return { client, requests };
}

test("raster type must agree with signature; SVG, spoofed MIME, empty and oversize rejected", async () => {
  assert.equal(await validateAdImage(png), "png");
  assert.equal(await validateAdImage(new Blob([new Uint8Array([255, 216, 255, 224])], { type: "image/jpeg" })), "jpg");
  assert.equal(await validateAdImage(new Blob(["RIFF1234WEBP"], { type: "image/webp" })), "webp");
  for (const file of [new Blob([], { type: "image/png" }), new Blob(["<svg/>"], { type: "image/svg+xml" }), new Blob(["<html>"], { type: "image/png" }), new Blob([png], { type: "image/jpeg" }), new Blob([new Uint8Array(AD_IMAGE_MAX_BYTES + 1)], { type: "image/png" })]) {
    await assert.rejects(validateAdImage(file), hasCode("invalid_image"));
  }
});

test("upload allocates new paths, never upserts and returns a relative DB reference", async () => {
  const { client, requests } = backend();
  const first = await uploadAdImage(client, maker, creative, png);
  const second = await uploadAdImage(client, maker, creative, png);
  assert.notEqual(first.imagePath, second.imagePath);
  assert.match(first.imagePath, new RegExp(`^${maker}/${creative}/[0-9a-f-]+\\.png$`));
  for (const { url, init } of requests) {
    assert.equal(url.origin, "https://demo.supabase.co");
    assert.ok(url.pathname.startsWith(`/storage/v1/object/ad-images/${maker}/${creative}/`));
    assert.equal(new Headers(init?.headers).get("x-upsert"), "false");
  }
});

test("invalid upload IDs or bytes perform no Storage request", async () => {
  const { client, requests } = backend();
  await assert.rejects(uploadAdImage(client, "../another", creative, png), hasCode("invalid_path"));
  await assert.rejects(uploadAdImage(client, maker, creative, new Blob(["text"], { type: "image/png" })), hasCode("invalid_image"));
  assert.equal(requests.length, 0);
});

test("preview signs only relative version paths for 5 minutes", async () => {
  const { client, requests } = backend();
  const result = await getAdImageUrl(client, path);
  assert.equal(result.expiresIn, 300);
  assert.ok(result.url.startsWith("https://demo.supabase.co/storage/v1/object/sign/"));
  assert.equal(JSON.parse(requests[0].init?.body as string).expiresIn, 300);
  for (const invalid of ["https://other.example/image.png", `/${path}`, `${path}?token=private`, "../outside.png", path.replace(".png", ".svg")]) {
    await assert.rejects(getAdImageUrl(client, invalid), hasCode("invalid_path"));
  }
  assert.equal(requests.length, 1);
});

test("storage failures are reported without returning private provider details", async () => {
  const { client } = backend(true);
  await assert.rejects(uploadAdImage(client, maker, creative, png), hasCode("upload_failed"));
  await assert.rejects(getAdImageUrl(client, path), hasCode("read_failed"));
});
