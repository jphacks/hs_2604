// Downloads the pinned public Groceries data (arules, GPL-3) into ./raw and verifies it.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

export const SOURCE = {
  name: "Groceries (arules)",
  commit: "cb89f0fc9996180a7044e5dd1b5a86d1fc577071",
  url: "https://raw.githubusercontent.com/mhahsler/arules/cb89f0fc9996180a7044e5dd1b5a86d1fc577071/data/Groceries.rda",
  sha256: "7a0e3408c631b5e3fe69af035a1209ffaf22b43b4af16218c5d5d23e761e6164",
};

if (process.argv[1]?.endsWith("fetch-groceries.mjs")) {
  const response = await fetch(SOURCE.url);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== SOURCE.sha256) throw new Error(`Unexpected sha256 ${digest}`);
  await mkdir(new URL("./raw/", import.meta.url), { recursive: true });
  await writeFile(new URL("./raw/Groceries.rda", import.meta.url), bytes);
  console.log(`Saved raw/Groceries.rda (${bytes.length} bytes, sha256 verified)`);
}
