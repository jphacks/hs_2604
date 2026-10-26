import { insightPath } from "@/lib/paths";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { getStoreSession } from "@/lib/store";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  // すでに店舗スタッフとして入っているなら審査画面へ戻す。
  const session = await getStoreSession().catch(() => null);
  if (session) redirect("/review");

  const demoFailed = (await searchParams).demo === "failed";

  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-xl font-bold">ログイン</h1>
      <p className="mt-2 mb-6 text-sm text-neutral-600">
        店舗スタッフのアカウントでログインしてください。自分の店舗のデータだけが表示されます。
      </p>
      {demoFailed ? (
        <p className="mb-4 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
          デモ用アカウントで接続できませんでした。環境変数のメールアドレスとパスワード、
          およびそのアカウントが店舗スタッフとして登録されているかを確認してください。
        </p>
      ) : null}
      <LoginForm />
      <p className="mt-4 text-sm"><a className="underline" href={insightPath("/fixed-results/index.html")}>説明用の固定成果を開く（ログイン不要）</a></p>
    </div>
  );
}
