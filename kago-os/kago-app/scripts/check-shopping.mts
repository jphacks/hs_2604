import {
  BackendError, createHeadlessBackend, readBackendConfig,
  signInBackend, signOutBackend,
} from "@kago/backend";
import { isUuid, loadShoppingContext, shoppingError, startShoppingVisit } from "../src/features/shopping/service.ts";

// Dedicated test accounts only. No service key, fixture insertion or permission
// changes. Default is read-only; explicit opt-in is required to end/start visits.
class CheckInputError extends Error {}
class CheckAssertionError extends Error {}
const requireInput = (name: string) => {
  const value = process.env[name];
  if (!value) throw new CheckInputError(`${name}を検証用の環境ファイルへ設定してください。`);
  return value;
};
const ensure = (condition: unknown, message: string) => { if (!condition) throw new CheckAssertionError(message); };
type Client = ReturnType<typeof createHeadlessBackend>;
const clients: Client[] = [];
let checks = 0;
const passed = (message: string) => { checks++; console.log(`確認 ${checks}: ${message}`); };

try {
  const storeId = requireInput("KAGO_CHECK_STORE_ID");
  if (!isUuid(storeId)) throw new CheckInputError("KAGO_CHECK_STORE_IDには検証店舗のUUIDを設定してください。");
  const credentials = ["A", "B"].map(label => ({
    email: requireInput(`KAGO_CHECK_CUSTOMER_${label}_EMAIL`),
    password: requireInput(`KAGO_CHECK_CUSTOMER_${label}_PASSWORD`),
  }));
  if (credentials[0].email.toLowerCase() === credentials[1].email.toLowerCase()) throw new CheckInputError("検証用の消費者アカウントを2件指定してください。");
  const config = readBackendConfig({ url: process.env.NEXT_PUBLIC_SUPABASE_URL, publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY });
  const users: string[] = [];
  for (const credential of credentials) {
    const client = createHeadlessBackend(config);
    clients.push(client);
    users.push((await signInBackend(client, credential.email, credential.password, "customer")).userId);
  }
  ensure(users[0] !== users[1], "異なる本人としてログインできませんでした。");
  passed("2利用者の消費者ログイン");
  let snapshots = await Promise.all(clients.map(client => loadShoppingContext(client, null)));
  ensure(snapshots.every(snapshot => snapshot.stores.some(store => store.id === storeId)), "検証店舗を両方の利用者で参照できませんでした。");
  passed("本人権限で店舗と進行中の来店を参照");
  const allowWrites = process.env.KAGO_CHECK_ALLOW_VISIT_WRITE === "1";
  let visits = snapshots.map(snapshot => snapshot.activeVisits.find(visit => visit.store_id === storeId)?.id);
  if (allowWrites) {
    snapshots = await Promise.all(clients.map(client => startShoppingVisit(client, { storeId, startNew: false, previousVisitId: null })));
    visits = snapshots.map(snapshot => snapshot.visit?.id);
    passed("店舗選択から本人の来店を開始または再開");
  }
  if (!visits.every(isUuid)) throw new CheckInputError("両利用者の進行中の来店を検証店舗に用意するか、専用テストアカウントに限りKAGO_CHECK_ALLOW_VISIT_WRITE=1を指定してください。書込みは行っていません。");
  const visitIds = visits as string[];
  snapshots = await Promise.all(clients.map((client, index) => loadShoppingContext(client, visitIds[index])));
  ensure(snapshots.every((snapshot, index) => snapshot.userId === users[index] && snapshot.visit?.id === visitIds[index]), "本人・店舗・来店を確定できませんでした。");
  ensure(snapshots.every(snapshot => snapshot.cart.length > 0), "かご復元の検証には、両利用者の来店に1件以上の検証商品が必要です。APP-02または管理者の専用データ投入で用意してください。");
  for (let i = 0; i < clients.length; i++) {
    const restored = await loadShoppingContext(clients[i], visitIds[i]);
    const cartState = (lines: typeof restored.cart) => JSON.stringify([...lines].sort((a, b) => a.productId.localeCompare(b.productId)));
    ensure(JSON.stringify(restored.visit) === JSON.stringify(snapshots[i].visit) && cartState(restored.cart) === cartState(snapshots[i].cart), "再取得で同じ来店・かごを復元できませんでした。");
  }
  passed("再取得で同じ本人の来店・かごを復元（両利用者に商品あり）");
  for (let i = 0; i < clients.length; i++) {
    const foreignId = visitIds[1 - i];
    const context = await loadShoppingContext(clients[i], foreignId);
    ensure(context.visit === null && context.cart.length === 0, "他人の来店指定でかごを返しました。");
    for (const table of ["visits", "cart_items"]) {
      const result = await clients[i].from(table).select(table === "visits" ? "id" : "visit_id").eq(table === "visits" ? "id" : "visit_id", foreignId);
      if (result.error) {
        if (result.error.code !== "42501") throw result.error;
      } else ensure(result.data?.length === 0, "直接のDB参照で他人の来店・かごを取得できました。");
    }
  }
  passed("他人の来店Cookie指定と直接DB参照を拒否");
  if (allowWrites) {
    for (let i = 0; i < clients.length; i++) {
      const next = await startShoppingVisit(clients[i], { storeId, startNew: true, previousVisitId: visitIds[i] });
      ensure(next.visit?.id !== visitIds[i] && next.cart.length === 0, "明示的な新規来店で空の別かごになりませんでした。");
      const retry = await startShoppingVisit(clients[i], { storeId, startNew: true, previousVisitId: visitIds[i] });
      ensure(retry.visit?.id === next.visit?.id, "同じ新規来店要求の再送で来店が増えました。");
    }
    passed("明示的新規来店と再送時の来店維持（旧かごは過去来店に保持）");
  } else console.log("未実施: 新規来店・再送の書込み検証（読取専用で実行）");
  await signOutBackend(clients[0]);
  try {
    await loadShoppingContext(clients[0], visitIds[0]);
    throw new CheckAssertionError("ログアウト後にかごを取得できました。");
  } catch (error) {
    if (!(error instanceof BackendError) || !["unauthenticated", "session_expired"].includes(error.code)) throw error;
  }
  passed("ログアウト後の本人データ取得を拒否");
  console.log(`APP-01の実接続確認: ${checks}項目成功。${allowWrites ? "書込み検証あり" : "読取専用・書込み項目は未実施"}。ブラウザ操作と実際の期限切れは別途確認してください。`);
} catch (error) {
  if (error instanceof CheckInputError || error instanceof CheckAssertionError) console.error(error.message);
  else {
    const safe = shoppingError(error);
    console.error(safe.code === "database_not_ready" ? "database_not_ready: migration適用とDB-06の権限・RLSを確認してください。" : `${safe.code}: ${safe.message}`);
  }
  process.exitCode = 1;
} finally {
  for (const client of clients) await signOutBackend(client).catch(() => undefined);
}
