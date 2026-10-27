import {
  loadDetailedAnalysis,
  originLabels,
} from "@/lib/detailed-analysis-source";
const names: Record<string, string> = {
  sponsored_related: "関連するメーカー広告",
  store_pick: "店舗おすすめ",
  co_purchase: "一緒に買われる商品",
  replenishment: "補充のおすすめ",
  popular: "売れ筋",
};
const states: Record<string, string> = {
  submitted: "本人の理由入力あり",
  skipped: "未設定（明示スキップ）",
  unanswered: "提示後に入力記録なし",
  uncollected: "提示記録なし（未収集・未到達）",
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const data = await loadDetailedAnalysis({
    from: typeof raw.from === "string" ? raw.from : undefined,
    to: typeof raw.to === "string" ? raw.to : undefined,
    origin: typeof raw.origin === "string" ? raw.origin : undefined,
  });
  const hours = data.hours ?? [];
  const fmt = (n: number) => n.toLocaleString("ja-JP");
  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">商品とおすすめの詳細分析</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          何が・いつ売れたかと、記録できたお買い物の操作を確認します。
        </p>
      </header>
      {data.mock && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm">
          固定例の合成データです。共有DBの実績ではありません。
        </p>
      )}
      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--line)] p-4">
        <label className="text-sm">
          開始日
          <input
            type="date"
            name="from"
            defaultValue={
              typeof raw.from === "string" ? raw.from : data.period?.from
            }
            className="mt-1 block rounded border p-2"
          />
        </label>
        <label className="text-sm">
          終了日
          <input
            type="date"
            name="to"
            defaultValue={typeof raw.to === "string" ? raw.to : data.period?.to}
            className="mt-1 block rounded border p-2"
          />
        </label>
        <label className="text-sm">
          記録の種類
          <select
            aria-label="記録の種類"
            name="origin"
            defaultValue={data.origin}
            className="mt-1 block rounded border p-2"
          >
            {Object.entries(originLabels).map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button className="min-h-11 rounded bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white">
          集計を表示
        </button>
      </form>
      {data.error ? (
        <p role="alert" className="rounded-xl bg-amber-50 p-4">
          {data.error}
        </p>
      ) : (
        data.period &&
        data.metrics &&
        data.ranking &&
        data.hours && (
          <>
            <p className="text-sm">
              集計期間（日本時間）：
              {new Date(data.period.start).toLocaleString("ja-JP", {
                timeZone: "Asia/Tokyo",
              })}{" "}
              〜{" "}
              {new Date(data.period.end).toLocaleString("ja-JP", {
                timeZone: "Asia/Tokyo",
              })}
              （終了時刻を含まない）／{originLabels[data.origin]}
            </p>
            <p className="rounded-xl bg-slate-100 p-3 text-sm">
              以下は観測した記録です。記録の欠落がない保証や販促の因果効果を示すものではありません。金額は値引き前の注文明細金額です。
            </p>
            <section className="rounded-xl border border-[var(--line)] p-4">
              <h2 className="font-bold">商品別の販売ランキング</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                販売点数順の上位20商品。広告・推薦を経由しない購入も含みます。表は横にスクロールできます。
              </p>
              {data.ranking.length === 0 ? (
                <p role="status" className="mt-3">
                  この期間・種類で観測した販売記録はありません。販売0件とは断定できません。
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead>
                      <tr>
                        <th className="p-2">商品</th>
                        <th className="p-2">販売数</th>
                        <th className="p-2">金額（値引き前）</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ranking.slice(0, 20).map((p) => (
                        <tr key={p.id}>
                          <th className="p-2">
                            {data.names?.[p.id] ?? "商品名未取得"}
                          </th>
                          <td className="p-2">{fmt(p.quantity)}点</td>
                          <td className="p-2">{fmt(p.amount)}円</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="rounded-xl border border-[var(--line)] p-4">
              <h2 className="font-bold">時間帯別の販売点数</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                日本時間の同じ時刻帯を期間内で合算します。記録がない時間帯は0とは扱いません。グラフは横にスクロールできます。
              </p>
              <div
                className="overflow-x-auto"
                tabIndex={0}
                aria-label="時間帯グラフを横にスクロール"
              >
                <svg
                  role="img"
                  aria-label="0時から23時の時間帯別販売点数"
                  viewBox="0 0 720 220"
                  className="mt-3 w-full min-w-[720px]"
                >
                  <line
                    x1="36"
                    y1="180"
                    x2="710"
                    y2="180"
                    stroke="currentColor"
                    opacity=".3"
                  />
                  {hours.map((h, i) => {
                    const max = Math.max(
                        1,
                        ...hours.map((x) => x.quantity ?? 0),
                      ),
                      height = ((h.quantity ?? 0) / max) * 145;
                    return (
                      <g key={i}>
                        {h.quantity !== null && (
                          <rect
                            x={40 + i * 27.5}
                            y={180 - height}
                            width="19"
                            height={height}
                            fill="var(--accent)"
                          >
                            <title>
                              {i}時台：{h.quantity}点
                            </title>
                          </rect>
                        )}
                        {(i % 3 === 0 || i === 23) && (
                          <text x={40 + i * 27.5} y="205" fontSize="12">
                            {i}時
                          </text>
                        )}
                      </g>
                    );
                  })}
                  <text x="0" y="32" fontSize="12">
                    {fmt(Math.max(1, ...hours.map((x) => x.quantity ?? 0)))}点
                  </text>
                  <text x="12" y="180" fontSize="12">
                    0
                  </text>
                </svg>
              </div>
              <details>
                <summary className="cursor-pointer text-sm">
                  時間帯別の観測値を表で確認
                </summary>
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr>
                        <th>時間帯</th>
                        <th>販売数</th>
                        <th>金額（値引き前）</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hours.map((h) => (
                        <tr key={h.hour}>
                          <th className="p-2">{h.hour}時台</th>
                          <td>
                            {h.quantity === null
                              ? "記録なし"
                              : fmt(h.quantity) + "点"}
                          </td>
                          <td>
                            {h.amount === null
                              ? "記録なし"
                              : fmt(h.amount) + "円"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
            <section className="rounded-xl border border-[var(--line)] p-4">
              <h2 className="font-bold">推薦の手法別のかご追加</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                母数は期間内に表示を記録した選定商品枠です。その表示以降、期間内に推薦から追加した枠を1件と数えます。購入率や人数ではありません。
              </p>
              {data.metrics.methods.length === 0 ? (
                <p role="status" className="mt-3">
                  表示を記録した選定商品枠がありません。追加率は算出しません。
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[580px] text-left text-sm">
                    <thead>
                      <tr>
                        <th className="p-2">手法</th>
                        <th>表示を記録した枠</th>
                        <th>追加あり</th>
                        <th>追加率</th>
                        <th>明示非表示あり</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.metrics.methods.map((m) => (
                        <tr key={m.placement_type + ":" + m.reason_code}>
                          <th className="p-2">
                            {names[m.reason_code] ?? m.reason_code}
                          </th>
                          <td>{fmt(m.shown)}</td>
                          <td>{fmt(m.added)}</td>
                          <td>
                            {m.shown > 0
                              ? ((m.added / m.shown) * 100).toFixed(1) + "%"
                              : "算出不可"}
                          </td>
                          <td>{fmt(m.dismissed)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-3 text-sm">
                期間内の表示と時系列を結び付けられない追加：
                {fmt(data.metrics.unshown_adds)}枠／非表示：
                {fmt(data.metrics.unshown_dismissals)}枠（上の率へ含めません）
              </p>
            </section>
            <section className="rounded-xl border border-[var(--line)] p-4">
              <h2 className="font-bold">比較と削除理由の記録</h2>
              <p className="mt-2 text-sm">
                商品比較の操作記録：{fmt(data.metrics.compared)}
                回。比較せず購入した利用者や、未購入・進行中の来店を離脱とは扱いません。記録がない場合も未使用・未収集を区別できる保証はありません。
              </p>
              <p className="mt-3 text-sm">
                観測した削除：{fmt(data.metrics.removals)}
                件。期間内の削除を対象に、理由は現在までの記録を元削除1件単位で数えます。
              </p>
              {data.metrics.removals === 0 ? (
                <p className="mt-2 text-sm">
                  削除の観測記録がありません。「拒否なし」や理由の収集済みとは扱いません。
                </p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {Object.entries(states).map(([state, label]) => (
                    <li key={state}>
                      {label}：
                      {fmt(
                        data.metrics!.removal_statuses.find(
                          (s) => s.status === state,
                        )?.count ?? 0,
                      )}
                      件
                    </li>
                  ))}
                </ul>
              )}
              {data.metrics.removal_reasons.length > 0 && (
                <div className="mt-3">
                  <h3 className="text-sm font-bold">本人が選んだ理由</h3>
                  <ul className="mt-1 text-sm">
                    {data.metrics.removal_reasons.map((r) => (
                      <li key={r.reason}>
                        {r.reason}：{fmt(r.count)}件
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-3 text-xs text-[var(--muted)]">
                提示後に入力がない記録は未回答・通信未着などを含み、在庫切れや心理状態を推測しません。比較操作を通らない購入も通常の購入です。
              </p>
            </section>
          </>
        )
      )}
    </section>
  );
}
