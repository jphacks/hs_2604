import Link from "next/link";
import { notFound } from "next/navigation";
import { readDemoConfig } from "@/features/demo/config";
import { DEMO_TRIGGER_CODE, exclusionLabels } from "@/features/offers/demo-compare";
import { loadDemoComparison, type DemoComparison } from "@/features/offers/demo-compare-server";
import type { NoveltyReason, RelationSource } from "@/features/offers/targeting";

// DEMO-07 (#118): demo-only screen (not linked from the App). Without the demo accounts it does not exist.
export const dynamic = "force-dynamic";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });
const score = (value: number) => value.toFixed(3).replace(/\.?0+$/, "");

const noveltyLabels: Record<NoveltyReason, string> = {
  regular_purchase: "定期購入品", purchased_before: "以前に購入", same_category: "同じ売場で未購入",
  never_purchased: "未購入", history_disabled: "履歴を使わない", history_empty: "履歴なし",
};
const relationLabels: Record<RelationSource, string> = { analysis: "公開購買データ", initial: "KAGO登録の組み合わせ", store: "店舗の指定" };
const accents = ["from-emerald-600 to-teal-600", "from-sky-600 to-indigo-600", "from-amber-500 to-orange-600"];

export default async function DemoComparePage({ searchParams }: { searchParams: Promise<{ trigger?: string | string[] }> }) {
  const config = readDemoConfig(process.env);
  if (!config) notFound();
  const requested = (await searchParams).trigger;
  const triggerCode = typeof requested === "string" && /^\d{8,14}$/.test(requested) ? requested : DEMO_TRIGGER_CODE;
  const { trigger, people } = await loadDemoComparison(config, triggerCode);

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-6 text-slate-950">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-emerald-700">KAGO/App DEMO</p>
            <h1 className="mt-1 text-2xl font-black">同じ商品を入れても、届くクーポンは人によって違う</h1>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-full bg-white px-4 py-2 font-bold shadow-sm">きっかけ：{trigger.name}</span>
            <Link href={`?trigger=${trigger.code}`} prefetch={false} className="rounded-full bg-slate-900 px-4 py-2 font-bold text-white">
              最新の値引き率で再計算
            </Link>
          </div>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {people.map((person, index) => <PersonColumn key={person.user} person={person} accent={accents[index]} />)}
        </div>

        <p className="mt-5 text-xs text-slate-500">
          スコア = 関連 × 意外性 × お得。App本番と同じ選定関数で、各利用者の購入履歴（利用を許可した人のみ）と店舗の現在の値引き率から計算しています。
          比較のための計算で、かごや受け取りの記録は変更しません。
        </p>
      </div>
    </main>
  );
}

function PersonColumn({ person, accent }: { person: DemoComparison; accent: string }) {
  const { decision } = person;
  const selected = decision.selected;
  const offer = selected && person.offers.find(item => item.offerId === selected.offerId);
  const top = Math.max(...decision.candidates.map(c => c.score), 1);
  const names = new Map(person.offers.map(item => [item.product.code, item.product.name]));
  const regularExclusions = decision.excluded.filter(item => item.reason === "regular_purchase");

  return (
    <section aria-label={`${person.label}さんの結果`} className="flex flex-col rounded-[2rem] border-[6px] border-slate-900 bg-white p-4 shadow-xl">
      <div className="flex items-center gap-3">
        <span className={`grid size-11 place-items-center rounded-full bg-gradient-to-br ${accent} text-lg font-black text-white`}>
          {person.label.slice(0, 1)}
        </span>
        <div>
          <p className="text-lg font-black">{person.label}さん</p>
          <p className="text-xs text-slate-500">{decision.historyStatus === "disabled" ? "購入履歴の利用：OFF" : "購入履歴の利用：ON"}</p>
        </div>
      </div>
      <p className="mt-3 min-h-10 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {decision.historyStatus === "disabled" ? "履歴を使わず、関連とお得さだけで選びます"
          : person.regularProducts.length ? `定期購入：${person.regularProducts.join("・")}` : "定期購入品はありません"}
      </p>

      {selected && offer ? (
        <div className={`mt-3 rounded-2xl bg-gradient-to-br ${accent} p-4 text-white`}>
          <p className="text-xs font-bold opacity-90">届いたクーポン</p>
          <div className="mt-1 flex items-end justify-between gap-2">
            <p className="text-xl font-black leading-tight">{selected.productName}</p>
            <p className="shrink-0 text-3xl font-black">{selected.discountPercent}%<span className="text-base">OFF</span></p>
          </div>
          <p className="mt-1 text-sm tabular-nums">
            <span className="line-through opacity-75">{yen.format(offer.product.price)}</span>
            {" → "}<b>{yen.format(offer.product.price - offer.unitDiscount)}</b>
          </p>
          <p className="mt-2 text-xs leading-relaxed opacity-95">{selected.reason}</p>
        </div>
      ) : (
        <p className="mt-3 rounded-2xl bg-slate-100 p-4 text-sm font-bold text-slate-500">届くクーポンはありません</p>
      )}

      {selected ? (
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-center gap-1 text-center text-xs tabular-nums">
          <Factor label="関連" value={selected.breakdown.association} note={relationLabels[selected.relation.source]} />
          <span className="text-slate-400">×</span>
          <Factor label="意外性" value={selected.breakdown.novelty} note={noveltyLabels[selected.noveltyReason]} />
          <span className="text-slate-400">×</span>
          <Factor label="お得" value={selected.breakdown.deal} note={`${selected.discountPercent}%OFF`} />
          <span className="text-slate-400">=</span>
          <div className="rounded-lg bg-slate-900 py-1.5 text-white"><p className="text-[10px] opacity-75">スコア</p><p className="font-black">{score(selected.score)}</p></div>
        </div>
      ) : null}

      <div className="mt-4 border-t border-slate-200 pt-3">
        <p className="text-xs font-bold text-slate-500">候補のスコア</p>
        <ul className="mt-2 grid gap-1.5 text-sm">
          {decision.candidates.map(candidate => (
            <li key={candidate.offerId} className="flex items-center gap-2">
              <span className={`w-28 shrink-0 truncate ${candidate.offerId === selected?.offerId ? "font-bold" : "text-slate-600"}`}>{candidate.productName}</span>
              <span className="h-2 min-w-0 flex-1 rounded-full bg-slate-100">
                <span className={`block h-2 rounded-full ${candidate.offerId === selected?.offerId ? "bg-emerald-600" : "bg-slate-300"}`}
                  style={{ width: `${(candidate.score / top) * 100}%` }} />
              </span>
              <span className="w-12 shrink-0 text-right text-xs tabular-nums">{score(candidate.score)}</span>
            </li>
          ))}
          {regularExclusions.map(item => (
            <li key={item.offerId} className="flex items-center gap-2 text-slate-400">
              <span className="w-28 shrink-0 truncate line-through">{names.get(item.productCode) ?? item.productCode}</span>
              <span className="text-xs">{exclusionLabels[item.reason]}のため候補外</span>
            </li>
          ))}
        </ul>
      </div>
      {person.claimedCouponCount > 0 ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          この来店で受け取り済みのクーポンは候補に出ません。デモ前に初期化してください。
        </p>
      ) : null}
    </section>
  );
}

function Factor({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-lg bg-slate-50 py-1.5" title={note}>
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="font-black">{score(value)}</p>
      <p className="truncate px-1 text-[10px] text-slate-500">{note}</p>
    </div>
  );
}
