"use server";

import { signInBackend, signOutBackend, toBackendError } from "@kago/backend";
import { redirect } from "next/navigation";
import { loginDestination } from "./login-destination";
import type { SignInState } from "./auth-state";
import { createServerBackendClient } from "./backend/server";

/**
 * 店舗スタッフとしてサインインする。
 * 役割が違う場合は共通ライブラリ側でサインアウトされ、セッションは残らない。
 */
export async function signInAction(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { message: "メールアドレスとパスワードを入力してください。" };
  }
  try {
    // Cookie を書くのは Server Action の中だけ。
    const client = await createServerBackendClient({ writableCookies: true });
    await signInBackend(client, email, password, "store_staff");
  } catch (error) {
    // 文言は共通ライブラリの固定文のみ。認証基盤の詳細は画面に出さない。
    return { message: toBackendError(error).message };
  }
  redirect(loginDestination(formData.get("next")));
}

export async function signOutAction() {
  try {
    const client = await createServerBackendClient({ writableCookies: true });
    await signOutBackend(client);
  } catch {
    // すでに切れている場合もログイン画面へ送れば済む。
  }
  redirect("/login");
}
