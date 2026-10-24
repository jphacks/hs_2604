import { access, cp, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(appRoot, "../lp/src");
const destination = resolve(appRoot, "public/website");

// The editable LP source lives in lp/src; this directory is a generated copy.
await access(resolve(source, "index.html"));
await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
console.log("lp/srcからAppのLP表示用ファイルを更新しました。");
