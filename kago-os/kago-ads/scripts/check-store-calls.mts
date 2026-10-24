import { BackendError, createHeadlessBackend, readBackendConfig, signInBackend, signOutBackend, toBackendError } from "@kago/backend";
import { createSupabaseStoreCallsRepository, requireStore } from "../src/lib/backend/store-calls.ts";

let client: ReturnType<typeof createHeadlessBackend> | undefined;
try {
  const email = process.env.KAGO_ADS_STORE_CHECK_EMAIL;
  const password = process.env.KAGO_ADS_STORE_CHECK_PASSWORD;
  if (!email || !password) throw new Error("検証用店舗のKAGO_ADS_STORE_CHECK_EMAILとKAGO_ADS_STORE_CHECK_PASSWORDをローカル環境に設定してください。");
  client = createHeadlessBackend(readBackendConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL, publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  }));
  await signInBackend(client, email, password, "store_staff");
  const identity = await requireStore(client);
  const storeId = process.env.KAGO_ADS_CHECK_STORE_ID || identity.storeIds[0];
  if (!identity.storeIds.includes(storeId)) throw new BackendError("forbidden");
  const session = { role: "store_staff", storeId } as const;
  const repo = createSupabaseStoreCallsRepository(client);
  const [calls, categories] = await Promise.all([repo.listMyAdCalls(session), repo.listCategories()]);
  if (calls.some((call) => call.store_id !== storeId)) throw new BackendError("forbidden");
  console.log("店舗の認証・所属確認・自店の募集読取に成功しました。");
  console.log("所属店舗数: " + identity.storeIds.length + "、募集数: " + calls.length + "、カテゴリ数: " + categories.length);
  await signOutBackend(client);
  try {
    await repo.listMyAdCalls(session);
    throw new Error("ログアウト後の拒否を確認できませんでした。");
  } catch (error) {
    if (toBackendError(error).code !== "unauthenticated") throw error;
  }
  console.log("ログアウト後の拒否を確認しました。募集の書込み・別ブラウザでの実演は別途確認してください。");
} catch (error) {
  console.error(error instanceof Error && error.message.startsWith("検証用店舗") ? error.message : toBackendError(error).message);
  process.exitCode = 1;
} finally {
  if (client) await signOutBackend(client).catch(() => undefined);
}
