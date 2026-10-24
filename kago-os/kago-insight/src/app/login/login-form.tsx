"use client";

import { useActionState } from "react";
import { signInAction } from "@/lib/auth-actions";
import type { SignInState } from "@/lib/auth-state";

const initial: SignInState = { message: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          メールアドレス
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          パスワード
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
        />
      </div>
      {state.message ? (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-[var(--accent)] px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {pending ? "確認しています…" : "ログイン"}
      </button>
    </form>
  );
}
