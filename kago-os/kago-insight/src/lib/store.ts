import "server-only";

import { BackendError, getBackendIdentity } from "@kago/backend";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { loginDestination } from "./login-destination";
import { isDemoAutoSignInEnabled } from "./demo";
import { createServerBackendClient } from "./backend/server";

export type MyStore = {
  id: string;
  name: string;
  branchName: string | null;
};

export type StoreSession = {
  client: Awaited<ReturnType<typeof createServerBackendClient>>;
  userId: string;
  store: MyStore;
};

/**
 * ログイン中の店舗スタッフと、その人の所属店舗を返す。
 *
 * 権限は二段構えになっている（DB-07）。
 *   1. JWT の kago.roles に store_staff が入っていること
 *   2. store_members にその人の行があること
 * 2 が無いと kago_is_store_staff() が false になり、画面は全部0件で返る。
 * エラーにならず空で返るので、ここで明示的に区別して文言を出す。
 *
 * 1リクエスト内で何度呼んでも Auth への問い合わせは1回で済むよう cache() で包む。
 */
export const getStoreSession = cache(async (): Promise<StoreSession> => {
  const client = await createServerBackendClient();
  // getUser() は Auth に問い合わせる。Cookie のデコードだけで信用しない。
  const identity = await getBackendIdentity(client, "store_staff");

  const { data, error } = await client
    .from("store_members")
    .select("store_id")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new BackendError("connection_failed");
  const storeId = data?.[0]?.store_id as string | undefined;
  if (!storeId) throw new BackendError("forbidden");

  const { data: stores, error: storeError } = await client
    .from("stores")
    .select("id, name, branch_name")
    .eq("id", storeId)
    .limit(1);
  if (storeError) throw new BackendError("connection_failed");
  const store = stores?.[0];
  if (!store) throw new BackendError("forbidden");

  return {
    client,
    userId: identity.userId,
    store: { id: store.id, name: store.name, branchName: store.branch_name ?? null },
  };
});

/**
 * 画面用。未ログインならログインへ送り、それ以外の失敗はそのまま投げる。
 * 投げた場合は各画面の error.tsx が受け取る。
 *
 * デモ用の環境変数が設定されている場合は、ログイン画面ではなく
 * サーバ側で自動サインインする経路へ送る（DEMO-04）。認証自体は通る。
 */
export async function requireStoreSession(): Promise<StoreSession> {
  try {
    return await getStoreSession();
  } catch (error) {
    if (error instanceof BackendError && (error.code === "unauthenticated" || error.code === "session_expired")) {
      if (isDemoAutoSignInEnabled()) {
        const pathname = (await headers()).get("x-kago-pathname") ?? "/review";
        redirect(`/api/demo-signin?next=${encodeURIComponent(pathname)}`);
      }
      const requestHeaders = await headers();
      const next = loginDestination(requestHeaders.get("x-kago-return-to") ?? requestHeaders.get("x-kago-pathname"));
      redirect("/login?next=" + encodeURIComponent(next));
    }
    throw error;
  }
}
