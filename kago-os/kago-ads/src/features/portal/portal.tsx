"use client";
// ADS-01：メーカーが複数店舗の募集（ad_calls）を探して比べる
import Link from "next/link";
import {AdsIcon} from "@/features/shell/ads-navigation";
import { useState } from "react";
import { usePortalRepository } from "@/features/auth/ads-runtime";
import { canApplyTo, callPhase, filterAdCalls, periodLabel, storeLabel, type PortalFilter } from "@/lib/domain/rules";
import { CHANNEL_LABEL, CHANNELS, type AdCall, type Channel, type Store } from "@/lib/domain/types";
import { ChannelTags, PhaseBadge } from "@/components/badges";
import { Card, Empty, ErrorList, inputClass, Loading, PageTitle } from "@/components/parts";
import { useLoad } from "@/lib/use-load";

const initial: PortalFilter = { keyword: "", category: "", channel: "", storeId: "", date: "", includeEnded: false };

export function Portal() {
  const getRepository = usePortalRepository();
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
        title="募集を探す"
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
        <div className="ads-portal-grid">
          <Card className="ads-filter space-y-4">
            <p className="ads-filter-title">条件で絞り込む</p>
            <label className="ads-field"><span className="ads-field-label">キーワード</span><input className={inputClass} aria-label="キーワード" placeholder="募集名・キーワード" value={filter.keyword} onChange={e=>set("keyword",e.target.value)}/></label>
            <label className="ads-field"><span className="ads-field-label">カテゴリ</span><select className={inputClass} value={filter.category} onChange={e=>set("category",e.target.value)} aria-label="カテゴリ">
              <option value="">すべてのカテゴリ</option>{state.data.categories.map(c=><option key={c}>{c}</option>)}
            </select></label>
            <label className="ads-field"><span className="ads-field-label">掲載先</span><select className={inputClass} value={filter.channel} onChange={e=>set("channel",e.target.value as Channel|"")} aria-label="掲載先">
              <option value="">すべての掲載先</option>{CHANNELS.map(c=><option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
            </select></label>
            <label className="ads-field"><span className="ads-field-label">店舗</span><select className={inputClass} value={filter.storeId} onChange={e=>set("storeId",e.target.value)} aria-label="店舗">
              <option value="">すべての店舗</option>{state.data.stores.map(s=><option key={s.id} value={s.id}>{storeLabel(s)}</option>)}
            </select></label>
            <label className="ads-field"><span className="ads-field-label">掲載したい日</span><input type="date" aria-label="この日に掲載できる募集" className={inputClass} value={filter.date} onChange={e=>set("date",e.target.value)}/></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filter.includeEnded} onChange={e=>set("includeEnded",e.target.checked)}/>終了した募集も表示</label>
            <button className="ads-filter-reset" onClick={()=>setFilter(initial)}>条件をクリア</button>
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
      <p className="ads-result-count"><span><strong>{list.length}</strong>件の募集</span><span>掲載条件を比較できます</span></p>
      <div className="space-y-3">
        {list.map((c) => {
          const store = storeOf(c.store_id);
          return (
            <Link key={c.id} href={`/ads/portal/call?id=${c.id}`} className="block">
              <Card className={`ads-call-card transition hover:border-brand ${canApplyTo(c) ? "" : "opacity-70"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <PhaseBadge phase={callPhase(c)} />
                  <ChannelTags channels={c.channels} />
                  <span className="text-xs text-muted">{store && storeLabel(store)}</span>
                </div>
                <h2 className="mt-2 font-bold">{c.title}</h2>
                <p className="ads-call-description line-clamp-2">{c.description}</p>
                <div className="ads-call-meta"><span>掲載期間 {periodLabel(c.starts_at, c.ends_at)}｜{c.categories.join("・")}</span><span className="ads-call-detail">詳細を見る<AdsIcon name="arrow"/></span></div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
