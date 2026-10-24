"use client";
// ADS-01：メーカーが複数店舗の募集（ad_calls）を探して比べる
import Link from "next/link";
import { useState } from "react";
import { getRepository } from "@/lib/data";
import { canApplyTo, callPhase, filterAdCalls, periodLabel, storeLabel, type PortalFilter } from "@/lib/domain/rules";
import { CHANNEL_LABEL, CHANNELS, type AdCall, type Channel, type Store } from "@/lib/domain/types";
import { ChannelTags, PhaseBadge } from "@/components/badges";
import { Card, Empty, ErrorList, inputClass, Loading, PageTitle } from "@/components/parts";
import { useLoad } from "@/lib/use-load";

const initial: PortalFilter = { keyword: "", category: "", channel: "", storeId: "", date: "", includeEnded: false };

export function Portal() {
  const { state } = useLoad(async () => {
    const repo = getRepository();
    const [calls, stores, categories] = await Promise.all([repo.listPublicAdCalls(), repo.listStores(), repo.listCategories()]);
    return { calls, stores, categories };
  }, []);
  const [filter, setFilter] = useState<PortalFilter>(initial);
  const set = <K extends keyof PortalFilter>(k: K, v: PortalFilter[K]) => setFilter((f) => ({ ...f, [k]: v }));

  return (
    <>
      <PageTitle
        title="募集ポータル"
        lead="店舗が出している広告募集を探せます。条件を比べて、出したい募集の詳細から申請へ進んでください。"
        action={
          <Link href="/ads/portal/stores" className="text-sm text-brand underline">
            店舗一覧から探す
          </Link>
        }
      />
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <ErrorList errors={[state.error]} />}
      {state.status === "ready" && (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <Card className="h-fit space-y-4">
            <p className="text-sm font-bold">絞り込み</p>
            <input className={inputClass} placeholder="キーワード" value={filter.keyword} onChange={(e) => set("keyword", e.target.value)} />
            <select className={inputClass} value={filter.category} onChange={(e) => set("category", e.target.value)} aria-label="カテゴリ">
              <option value="">すべてのカテゴリ</option>
              {state.data.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select className={inputClass} value={filter.channel} onChange={(e) => set("channel", e.target.value as Channel | "")} aria-label="掲載先">
              <option value="">すべての掲載先</option>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABEL[c]}
                </option>
              ))}
            </select>
            <select className={inputClass} value={filter.storeId} onChange={(e) => set("storeId", e.target.value)} aria-label="店舗">
              <option value="">すべての店舗</option>
              {state.data.stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {storeLabel(s)}
                </option>
              ))}
            </select>
            <label className="block text-sm">
              <span className="text-xs text-muted">この日に掲載できる募集</span>
              <input type="date" className={`${inputClass} mt-1`} value={filter.date} onChange={(e) => set("date", e.target.value)} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={filter.includeEnded} onChange={(e) => set("includeEnded", e.target.checked)} />
              終了した募集も表示
            </label>
            <button className="text-xs text-muted underline" onClick={() => setFilter(initial)}>
              条件をクリア
            </button>
          </Card>
          <Results filter={filter} calls={state.data.calls} stores={state.data.stores} />
        </div>
      )}
    </>
  );
}

function Results({ filter, calls, stores }: { filter: PortalFilter; calls: AdCall[]; stores: Store[] }) {
  const list = filterAdCalls(calls, filter);
  const storeOf = (id: string) => stores.find((s) => s.id === id);
  if (list.length === 0) {
    return <Empty>条件に合う募集はありません。条件をゆるめるか、「終了した募集も表示」で過去の募集を確認してください。</Empty>;
  }
  return (
    <div>
      <p className="mb-3 text-sm text-muted">{list.length}件の募集</p>
      <div className="space-y-3">
        {list.map((c) => {
          const store = storeOf(c.store_id);
          return (
            <Link key={c.id} href={`/ads/portal/call?id=${c.id}`} className="block">
              <Card className={`transition hover:border-brand ${canApplyTo(c) ? "" : "opacity-70"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <PhaseBadge phase={callPhase(c)} />
                  <ChannelTags channels={c.channels} />
                  <span className="text-xs text-muted">{store && storeLabel(store)}</span>
                </div>
                <h2 className="mt-2 font-bold">{c.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{c.description}</p>
                <p className="mt-2 text-xs text-muted">
                  掲載期間 {periodLabel(c.starts_at, c.ends_at)}｜{c.categories.join("・")}
                </p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
