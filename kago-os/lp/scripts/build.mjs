import { access, cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "dist");
await access(resolve(root, "src/index.html"));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(root, "src"), resolve(output, "website"), { recursive: true });
await cp(resolve(root, "public"), output, { recursive: true });
await cp(resolve(root, "src/index.html"), resolve(output, "index.html"));
console.log("LPの静的配信ファイルをdistに出力しました。");
