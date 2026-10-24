"use client";
// 端末を選んで全画面表示を開く入口。本番では端末ごとに専用のアカウントでログインし、URL を固定して開く
import Link from "next/link";
import { getRepository } from "@/lib/data";
import { storeLabel } from "@/lib/domain/rules";
import { Card, ErrorList, Loading, PageTitle } from "@/components/parts";
import { useLoad } from "@/lib/use-load";

export function SignageHome() {
  const { state } = useLoad(async () => {
    const repo = getRepository();
    const stores = await repo.listStores();
    return Promise.all(stores.map(async (store) => ({ store, devices: await repo.listSignageDevices(store.id) })));
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <p className="text-sm font-semibold text-brand">KAGO/Signage</p>
      <PageTitle
        title="端末を選ぶ"
        lead="選んだ端末の店舗で承認済みの広告と店舗販促を、全画面で順に表示します。画面をクリックすると全画面になります。"
      />
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <ErrorList errors={[state.error]} />}
      {state.status === "ready" && (
        <div className="space-y-4">
          {state.data.map(({ store, devices }) => (
            <Card key={store.id}>
              <p className="font-bold">{storeLabel(store)}</p>
              <ul className="mt-3 divide-y divide-line">
                {devices.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      {d.id}｜{d.location}
                    </span>
                    <span className="flex gap-3">
                      <Link className="font-semibold text-brand hover:underline" href={`/signage/play?device=${d.id}`}>
                        全画面で開く
                      </Link>
                      <Link className="text-muted hover:underline" href={`/signage/play?device=${d.id}&debug=1`}>
                        状態を表示して開く
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          <p className="text-sm text-muted">
            販促の停止・デモ用の時刻・再生記録の確認は
            <Link className="mx-1 text-brand hover:underline" href="/signage/dev?as=store_staff:S1">
              Signage の確認
            </Link>
            （店舗の担当者）で行います。
          </p>
        </div>
      )}
    </main>
  );
}
