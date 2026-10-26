import { loginDestination } from "@/lib/login-destination";
import { insightPath } from "@/lib/paths";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { getStoreSession } from "@/lib/store";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string | string[]; next?: string | string[] }>;
}) {
  const params = await searchParams;
  const nextPath = loginDestination(params.next);
  // 認証済みの場合も、検証した元の画面へ戻す。
  const session = await getStoreSession().catch(() => null);
  if (session) redirect(nextPath);

  const demoFailed = params.demo === "failed";

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
      <LoginForm nextPath={nextPath} />
      <p className="mt-4 text-sm"><a className="underline" href={insightPath("/fixed-results/index.html")}>説明用の固定成果を開く（ログイン不要）</a></p>
    </div>
  );
}
