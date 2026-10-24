// Rebuilds kago-core/supabase/seed/data01_responses.json from the seed applied to a disposable PGlite.
// Run after changing the seed or a migration that changes what a role can read.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { accounts, createDemoDatabase, responsesFile, userId, volatile } from "../tests/fixtures/demo-database.mts";

const { db, seed, responses } = await createDemoDatabase();
await seed();
const document = {
  about: "DATA-01の架空データ。各アカウントがDB-06の権限で読める行（PostgRESTのselect *と同じJSON形式）。DB接続前の仮応答に使う。",
  generated_by: "kago-os/kago-app: pnpm generate:demo-responses",
  accounts: Object.fromEntries(Object.entries(accounts).map(([key, a]) =>
    [key, { email: a.email, kago: a.kago, test_user_id: userId(key as keyof typeof accounts) }])),
  note: "user_id系の値はテスト用の仮UUID。実環境ではSupabase Authの値に置き換わる。volatileの列はDBの時計で決まるため固定値に置換している。",
  volatile,
  responses: await responses(),
};
await writeFile(responsesFile, JSON.stringify(document, null, 2) + "\n");
await db.close();
console.log(`wrote ${fileURLToPath(responsesFile)}`);
