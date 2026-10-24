import { createHeadlessBackend, readBackendConfig, signInBackend, signOutBackend, toBackendError } from "@kago/backend";
import { createSupabasePortalRepository, requireMaker } from "../src/lib/backend/portal.ts";

let client: ReturnType<typeof createHeadlessBackend> | undefined;
try {
  const email = process.env.KAGO_ADS_CHECK_EMAIL;
  const password = process.env.KAGO_ADS_CHECK_PASSWORD;
  if (!email || !password) throw new Error("検証用メーカーのKAGO_ADS_CHECK_EMAILとKAGO_ADS_CHECK_PASSWORDをローカル環境に設定してください。");
  client = createHeadlessBackend(readBackendConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL, publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  }));
  await signInBackend(client, email, password, "maker_staff");
  const identity = await requireMaker(client);
  const repo = createSupabasePortalRepository(client);
  const [stores, calls] = await Promise.all([repo.listStores(), repo.listPublicAdCalls()]);
  if (calls.some((c) => c.status === "draft")) throw new Error("下書きが公開一覧に含まれています。");
  console.log("メーカーの認証・所属確認・店舗と募集のDB読取に成功しました。");
  console.log("所属数: " + identity.makerIds.length + "、参照店舗数: " + stores.length + "、公開済み募集数: " + calls.length);
  if (stores.length < 2) console.log("2店舗比較の完了条件は未確認です。共通データを確認してください。");
  await signOutBackend(client);
  try {
    await repo.listPublicAdCalls();
    throw new Error("ログアウト後の拒否を確認できませんでした。");
  } catch (error) {
    if (toBackendError(error).code !== "unauthenticated") throw error;
  }
  console.log("ログアウト後に募集読取が拒否されることを確認しました。");
} catch (error) {
  console.error(error instanceof Error && error.message.startsWith("検証用メーカー") ? error.message : toBackendError(error).message);
  process.exitCode = 1;
} finally {
  if (client) await signOutBackend(client).catch(() => undefined);
}
