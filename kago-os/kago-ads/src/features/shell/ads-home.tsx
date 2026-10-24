"use client";
import { useSession } from "@/lib/session";
import { ButtonLink, Card, PageTitle } from "@/components/parts";

export function AdsHome() {
  const session = useSession();
  return (
    <>
      <PageTitle
        title="KAGO/Ads"
        lead="店舗が「うちの売り場のサイネージ・App に広告を出しませんか」と募集し、メーカーが募集を探して広告を申請するポータルです。審査・承認は店舗が KAGO/Insight で行います。"
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <p className="text-xs font-semibold text-brand">店舗の担当者</p>
          <h2 className="mt-1 text-lg font-bold">広告を募集する</h2>
          <p className="mt-2 text-sm text-muted">対象カテゴリ・掲載期間・掲載先（App／Signage）を決めて募集を公開します。公開しても、広告の掲載が承認されたことにはなりません。</p>
          <div className="mt-4">
            {session.role === "store_staff" ? (
              <ButtonLink href="/ads/store/calls">自店の募集を見る</ButtonLink>
            ) : (
              <p className="text-xs text-muted">右上の「ログイン（デモ）」で店舗を選んでください。</p>
            )}
          </div>
        </Card>
        <Card>
          <p className="text-xs font-semibold text-brand">メーカー</p>
          <h2 className="mt-1 text-lg font-bold">募集を探して申請する</h2>
          <p className="mt-2 text-sm text-muted">複数店舗の募集を比べ、広告の画像・動画を登録して申請します。審査の結果は掲載先ごとに届きます。</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href="/ads/portal">募集を探す</ButtonLink>
            {session.role === "maker_staff" && (
              <>
                <ButtonLink href="/ads/maker/creatives" variant="secondary">
                  自社の広告
                </ButtonLink>
                <ButtonLink href="/ads/maker/applications" variant="secondary">
                  申請一覧
                </ButtonLink>
              </>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
