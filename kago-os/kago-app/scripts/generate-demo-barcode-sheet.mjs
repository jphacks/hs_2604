// Printable sample barcodes for every product of the demo store (DATA-01 S1), read from the seeds:
// DATA-01 (22) + DEMO-05 生バジル + #144 fresh products (27). Output: docs/demo-barcodes/
//   <code>.svg (EAN-13 for 13-digit codes, Code 128 for PLU-… codes), index.html, demo-barcodes.pdf, README.md
// Usage (kago-os/kago-app): node scripts/generate-demo-barcode-sheet.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import bwipjs from "bwip-js";
import { chromium } from "playwright";

const seeds = resolve("../kago-core/supabase/seed");
const out = resolve("../../docs/demo-barcodes");
mkdirSync(out, { recursive: true });

const rows = (file, pattern) => [...readFileSync(join(seeds, file), "utf8").matchAll(pattern)];
const products = [
  ...rows("data01_demo.sql", /\(\s*\d+, '(\d{13}|PLU-\d{4})',\s*'([^']+)',\s*'([^']+)',\s*(\d+)\)/g),
  ...rows("demo05_users_offers.sql", /\('[0-9a-f-]+','(\d{13})','([^']+)','([^']+)'\)/g).map(m => [...m.slice(0, 4), "198"]),
  ...rows("app_menu_fresh_products.sql", /\(\s*\d+, '(PLU-\d{4})', '([^']+)',\s*'([^']+)',\s*(\d+)\)/g),
].map(([, code, name, category, price]) => ({ code, name: name.trim(), category, price: Number(price) }));
const unique = [...new Map(products.map(p => [p.code, p])).values()];
if (unique.length !== 50) throw new Error(`expected 50 demo store products, found ${unique.length}`);

const symbology = code => /^\d{13}$/.test(code) ? "ean13" : "code128";
for (const p of unique) {
  const svg = bwipjs.toSVG({ bcid: symbology(p.code), text: p.code, scale: 3, height: 14, includetext: true,
    textxalign: "center", textsize: 11, paddingwidth: 10, paddingheight: 8, backgroundcolor: "FFFFFF" });
  writeFileSync(join(out, `${p.code}.svg`), svg, "utf8");
}

const yen = n => `¥${n.toLocaleString("ja-JP")}`;
const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>KAGO デモ店舗 サンプルバーコード</title>
<style>@page{size:A4;margin:10mm}body{font-family:"Noto Sans CJK JP","Hiragino Sans",sans-serif;margin:0;color:#111}
h1{font-size:16px;margin:0 0 2px}p.note{font-size:10px;margin:0 0 8px;color:#444}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.card{border:1px solid #999;padding:6px;break-inside:avoid}
.card h2{font-size:11px;margin:0;line-height:1.3}.meta{font-size:9px;color:#555;display:flex;justify-content:space-between}
.card img{width:78%;height:auto;display:block;margin:4px auto 0}</style></head><body>
<h1>KAGO/OS デモ店舗（hiroshima-demo-store）サンプルバーコード ${unique.length}点</h1>
<p class="note">架空の商品です。KAGO Appの「カメラで読み取る」で読み取れます（13桁はEAN-13、PLU-で始まる商品はCode 128）。価格は参考で、購入時は店舗の現在価格が適用されます。倍率100%で印刷してください。</p>
<div class="grid">${unique.map(p => `<div class="card"><div class="meta"><span>${esc(p.category)}</span><span>${yen(p.price)}</span></div>
<h2>${esc(p.name)}</h2><img src="${p.code}.svg" alt="${esc(p.name)} ${p.code}"></div>`).join("\n")}</div></body></html>`;
writeFileSync(join(out, "index.html"), html, "utf8");

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {});
const page = await browser.newPage();
await page.goto(`file://${join(out, "index.html")}`); await page.waitForLoadState("networkidle");
await page.pdf({ path: join(out, "demo-barcodes.pdf"), format: "A4", printBackground: true, margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" } });
await browser.close();

const table = unique.map(p => `| ${p.category} | ${p.name} | \`${p.code}\` | ${symbology(p.code) === "ean13" ? "EAN-13" : "Code 128"} | ${yen(p.price)} | [SVG](${p.code}.svg) |`).join("\n");
writeFileSync(join(out, "README.md"), `# デモ店舗のサンプルバーコード

デモ店舗（DATA-01 S1・hiroshima-demo-store）で扱う架空商品${unique.length}点のバーコードです。KAGO Appの「カメラで読み取る」で読み取れます。

- 印刷用：[demo-barcodes.pdf](demo-barcodes.pdf)（A4・3列。倍率100%で印刷）
- 画面表示用：[index.html](index.html)、商品ごとのSVG
- 13桁のコードはEAN-13、\`PLU-\`で始まる商品はCode 128です。
- 価格は参考です。購入時は店舗の現在価格が適用されます。
- 再生成：\`kago-os/kago-app\`で \`node scripts/generate-demo-barcode-sheet.mjs\`（商品は各seedから読み取ります）

| 種類 | 商品 | コード | 形式 | 参考価格 | 画像 |
| --- | --- | --- | --- | ---: | --- |
${table}
`, "utf8");
console.log(`${unique.length}件のバーコードを docs/demo-barcodes に出力しました。`);
