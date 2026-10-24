import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import bwipjs from "bwip-js";

const root = process.cwd();
const products = JSON.parse(
  readFileSync(join(root, "src/data/demo/products.json"), "utf8"),
);
const outputDir = join(root, "public/demo/barcodes");

mkdirSync(outputDir, { recursive: true });

for (const product of products) {
  const svg = bwipjs.toSVG({
    bcid: "ean13",
    text: product.code,
    scale: 3,
    height: 14,
    includetext: true,
    textxalign: "center",
    textsize: 11,
    paddingwidth: 8,
    paddingheight: 8,
    backgroundcolor: "FFFFFF",
  });

  writeFileSync(join(outputDir, `${product.code}.svg`), svg, "utf8");
}

console.log(`${products.length}件のEAN-13画像を生成しました。`);
