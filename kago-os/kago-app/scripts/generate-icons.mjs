import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "public/brand/light/icon-kago-app.png");
const darkSource = join(root, "public/brand/dark/icon-kago-app.png");
const outputDir = join(root, "public/icons/app");
const osOutputDir = join(root, "public/icons/os");
const osSource = join(root, "public/brand/light/icon-kago-os.png");
const osDarkSource = join(root, "public/brand/dark/icon-kago-os.png");

await mkdir(outputDir, { recursive: true });
await mkdir(osOutputDir, { recursive: true });

const icons = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
];

await Promise.all(
  icons.map(({ file, size }) =>
    sharp(source)
      .resize(size, size)
      .png()
      .toFile(join(outputDir, file)),
  ),
);

// Maskable artwork stays within the central safe circle; Apple gets an opaque tile.
const maskable = await sharp(source).resize(384, 384).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#f5f8fa" } })
  .composite([{ input: maskable, left: 64, top: 64 }]).png().toFile(join(outputDir, "icon-512-maskable.png"));
await sharp(source).resize(180, 180).flatten({ background: "#f5f8fa" }).png().toFile(join(outputDir, "apple-touch-icon.png"));
await sharp(source).resize(64, 64).png().toFile(join(outputDir, "favicon-light.png"));
await sharp(darkSource).resize(64, 64).png().toFile(join(outputDir, "favicon-dark.png"));
await sharp(osSource).resize(64, 64).png().toFile(join(osOutputDir, "favicon-light.png"));
await sharp(osDarkSource).resize(64, 64).png().toFile(join(osOutputDir, "favicon-dark.png"));
await sharp(osSource).resize(180, 180).flatten({ background: "#f5f8fa" }).png().toFile(join(osOutputDir, "apple-touch-icon.png"));
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((size) => sharp(osSource).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (let i = 0; i < sizes.length; i++) {
  const entry = 6 + i * 16;
  header[entry] = sizes[i]; header[entry + 1] = sizes[i];
  header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[i].length, entry + 8); header.writeUInt32LE(offset, entry + 12);
  offset += images[i].length;
}
await writeFile(join(root, "public/favicon.ico"), Buffer.concat([header, ...images]));
console.log("正式KAGO/OS・KAGO/Appから階層別favicon・PWAアイコンを更新しました。");
