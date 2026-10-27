import type { SignagePlayHistory } from "@/lib/signage-plays";
import { playEndLabel,playOriginLabel,playReasonLabel } from "@/lib/signage-play-labels";
const time=(s:string)=>new Date(s).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"});
export function PlayHistory({rows}:{rows:SignagePlayHistory[]}) {
 return <section className="space-y-3" aria-labelledby="play-history-heading">
  <h2 id="play-history-heading" className="text-xl font-bold">通常再生の履歴</h2>
  <p className="text-sm text-[var(--muted)]">自店の直近100件。通常の承認順・店舗おすすめ・代替案内も確認できます。再生は端末の動作記録で、人による視認を示すものではありません。</p>
  {!rows.length?<p role="status">保存済みの再生履歴はまだありません。</p>:
   <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel)]">
    <table className="w-full text-left text-sm">
     <caption className="sr-only">自店のサイネージ再生時刻・選定理由・素材版</caption>
     <thead><tr className="border-b border-[var(--line)]"><th className="p-3">再生時刻（日本時間）</th><th className="p-3">選定理由</th><th className="p-3">終了理由</th><th className="p-3">対象・素材版</th></tr></thead>
     <tbody>{rows.map(row=><tr key={row.id} data-testid="signage-play" className="border-b border-[var(--line)] align-top">
      <td className="whitespace-nowrap p-3">{time(row.started_at)}<br/>〜{time(row.ended_at)}<p className="mt-1 text-xs text-[var(--muted)]">{playOriginLabel(row.data_origin)}</p></td>
      <td className="p-3">{playReasonLabel(row.reason_code)}<p className="mt-1 text-xs text-[var(--muted)]">{row.reason_code}</p></td>
      <td className="p-3">{playEndLabel(row.end_reason)}</td>
      <td className="max-w-xs break-all p-3"><p>{row.ad_placement_id?"メーカー広告":row.promotion_version_id?"店舗のおすすめ":"汎用案内"}</p>
       <details className="mt-2 text-xs text-[var(--muted)]"><summary>再生ID・素材版を確認</summary>
        <p>再生ID：{row.id}</p><p>端末ID：{row.device_id}</p><p>表示モード：{row.mode}</p>
        {row.ad_placement_id&&<p>広告ID：{row.ad_placement_id}</p>}
        {row.creative_version_id&&<p>素材版ID：{row.creative_version_id}</p>}
        {row.promotion_version_id&&<p>販促版ID：{row.promotion_version_id}</p>}
       </details>
      </td>
     </tr>)}</tbody>
    </table>
   </div>}
 </section>;
}
