import {
  checkBackendConnection, createHeadlessBackend, readBackendConfig,
  roles, signInBackend, signOutBackend, toBackendError, type BackendRole,
} from "@kago/backend";

// Run with Node's --env-file=.env.local; credentials never enter CLI arguments.
class CheckInputError extends Error {}

let client: ReturnType<typeof createHeadlessBackend> | undefined;
try {
  const role = process.env.KAGO_CHECK_ROLE;
  if (!roles.includes(role as BackendRole) || !process.env.KAGO_CHECK_EMAIL || !process.env.KAGO_CHECK_PASSWORD) {
    throw new CheckInputError("KAGO_CHECK_ROLE（customer / store_staff / maker_staff / signage）・KAGO_CHECK_EMAIL・KAGO_CHECK_PASSWORDを設定してください。");
  }
  client = createHeadlessBackend(readBackendConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  }));
  await signInBackend(client, process.env.KAGO_CHECK_EMAIL, process.env.KAGO_CHECK_PASSWORD, role as BackendRole);
  await checkBackendConnection(client, role as BackendRole);
  await signOutBackend(client);
  try {
    await checkBackendConnection(client);
    throw new Error("ログアウト後の接続が拒否されませんでした。");
  } catch (error) {
    if (toBackendError(error).code !== "unauthenticated") throw error;
  }
  console.log(`${role}: ログイン・DB接続・ログアウト後の拒否を確認しました。`);
} catch (error) {
  const safe = toBackendError(error);
  console.error(error instanceof CheckInputError ? error.message : `${safe.code}: ${safe.message}`);
  process.exitCode = 1;
} finally {
  if (client) await signOutBackend(client).catch(() => undefined);
}
