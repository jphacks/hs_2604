import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <p className="text-sm font-semibold text-brand">KAGO/OS</p>
      <h1 className="mt-1 text-3xl font-bold">kago-ads</h1>
      <p className="mt-2 text-muted">KAGO/Ads（広告募集・申請）と KAGO/Signage（店内サイネージ）のアプリ。</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link href="/ads" className="rounded-xl border border-line bg-surface p-5 hover:border-brand">
          <p className="font-bold">KAGO/Ads</p>
          <p className="mt-1 text-sm text-muted">店舗の広告募集と、メーカーの広告申請</p>
        </Link>
        <Link href="/signage" className="rounded-xl border border-line bg-surface p-5 hover:border-brand">
          <p className="font-bold">KAGO/Signage</p>
          <p className="mt-1 text-sm text-muted">店内サイネージの全画面表示と再生記録</p>
        </Link>
      </div>
    </main>
  );
}
