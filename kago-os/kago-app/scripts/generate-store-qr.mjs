import bwipjs from "bwip-js";
import { writeFile } from "node:fs/promises";

const [origin, storeId, output] = process.argv.slice(2);
if (!origin || !storeId || !output || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId)) {
  throw new Error("Usage: node scripts/generate-store-qr.mjs <https://app-origin> <store-uuid> <output.svg>");
}
const base = new URL(origin);
if (base.origin !== origin || (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname)))) {
  throw new Error("HTTPSの公開元、またはhttp://localhostを指定してください（パス・末尾スラッシュなし）。");
}
const url = new URL("/App", base);
url.searchParams.set("store", storeId.toLowerCase());
const svg = bwipjs.toSVG({ bcid: "qrcode", eclevel: "H", text: url.href, scale: 5, padding: 4, backgroundcolor: "FFFFFF" });
const [, width, height] = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
await writeFile(output, svg.replace("<svg ", `<svg width="${width}" height="${height}" `));
console.log(`店舗用QRを保存しました: ${output}`);
