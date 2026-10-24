import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { getStoreSession } from "@/lib/store";

export default async function LoginPage() {
  // すでに店舗スタッフとして入っているなら審査画面へ戻す。
  const session = await getStoreSession().catch(() => null);
  if (session) redirect("/review");

  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-xl font-bold">ログイン</h1>
      <p className="mt-2 mb-6 text-sm text-neutral-600">
        店舗スタッフのアカウントでログインしてください。自分の店舗のデータだけが表示されます。
      </p>
      <LoginForm />
    </div>
  );
}
