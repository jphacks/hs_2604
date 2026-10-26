import { fetchSignageDecisions } from "@/lib/signage-decisions";
import { USING_MOCK } from "@/lib/mode";
const time=(s:string)=>new Date(s).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"});
export default async function Page(){
 const {rows,unavailable}=await fetchSignageDecisions();
 return <section className="space-y-5">
  <div><p className="text-sm text-[var(--muted)]">SIG-06</p><h1 className="text-2xl font-bold">サイネージの選定理由</h1>
   <p className="mt-2 text-sm text-[var(--muted)]">自店の直近100件。選定理由は端末の報告です。かご傾向は直近15分以内に活動のあった来店を利用者ごとに数え、5人未満の内訳は表示しません。</p></div>
  <form method="get"><button className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-bold">最新の履歴に更新</button></form>
  {unavailable?<p role="status">選定履歴のDB設定が未適用です。SIG-06のmigration適用後に利用できます。</p>:
   rows.length===0?<p role="status">{USING_MOCK?"モック表示では実際の端末の選定履歴はありません。":"選定履歴はまだありません。端末で集計選定を有効にし、再生が終了すると記録されます。"}</p>:null}
  {rows.map(row=><article key={row.play_id} data-testid="signage-decision" className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
   <p className="text-sm text-[var(--muted)]">{time(row.decision.selected_at)}（日本時間）</p>
   <h2 className="mt-2 font-bold">{row.decision.reason_text}</h2>
   <p className="mt-2 text-sm">{row.decision.selected_key?"店内集計に応じたメーカー広告":"汎用の買い物案内"}</p>
   {row.decision.snapshot?<div className="mt-3 text-sm">
    <p>集計対象：{row.decision.snapshot.sample_size}人／取得：{time(row.decision.snapshot.observed_at)}</p>
    <ul className="mt-2 flex flex-wrap gap-3">{row.decision.snapshot.categories.map(c=><li key={c.category}>{c.category}：{c.visits}人</li>)}</ul>
   </div>:<p className="mt-3 text-sm text-[var(--muted)]">集計の内訳は保持していません。</p>}
   <details className="mt-3 text-xs text-[var(--muted)]"><summary>再現用の選定記録</summary>
    <p className="mt-2 break-all">再生ID：{row.play_id}／端末ID：{row.device_id}／選定版：{row.decision.policy_version}／理由コード：{row.decision.reason_code}</p>
    <p className="break-all">選択対象：{row.decision.selected_key??"案内"}</p>
    <ul>{row.decision.weights.map((w,i)=><li className="break-all" key={i}>{w.key}：{w.weight}</li>)}</ul>
   </details>
  </article>)}
 </section>;
}
