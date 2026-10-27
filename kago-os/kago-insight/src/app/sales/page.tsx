import { loadPromotionSales, type SalesSearch } from "@/lib/promotion-sales";
import { salesDifference } from "@/lib/sales-trends";
import { SalesChart } from "@/features/sales/sales-chart";
const time = (s: string) =>
  new Date(s).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
const originName = {
  operated: "通常操作（疑似購入を含む）",
  seeded: "事前投入",
  synthetic: "合成データ",
};
const yen = (n: number) => n.toLocaleString("ja-JP") + "円";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams,
    search: SalesSearch = {};
  for (const key of ["promotion", "from", "to", "bucket", "origin"] as const)
    if (typeof raw[key] === "string") search[key] = raw[key];
  const data = await loadPromotionSales(search),
    current = data.current,
    previous = data.previous,
    comparison =
      current && previous
        ? [
            {
              label: "販売数",
              current: current.quantity,
              previous: previous.quantity,
              unit: "点",
            },
            {
              label: "販売金額",
              current: current.amount,
              previous: previous.amount,
              unit: "円",
            },
          ]
        : [];
  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">販促商品の販売推移</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          対象商品の販売を、販促期間内と直前の同じ長さの期間で確認します。広告や推薦を経由しない購入も含みます。
        </p>
      </div>
      {data.mock && (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm">
          固定例の合成データです。共有DBの実績ではありません。
        </p>
      )}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--line)] p-4"
      >
        <label className="min-w-0 basis-full flex-1 text-sm sm:min-w-64 sm:basis-auto">
          販促
          <select
            aria-label="販促"
            name="promotion"
            defaultValue={data.selected?.promotion_version_id}
            className="mt-1 block w-full rounded border p-2"
          >
            {data.promotions.map((p) => (
              <option
                key={p.promotion_version_id}
                value={p.promotion_version_id}
              >
                {p.product_name}・第{p.version}版（
                {p.status === "active" ? "有効" : "停止"}）
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          開始日
          <input
            type="date"
            name="from"
            defaultValue={data.from}
            className="mt-1 block rounded border p-2"
          />
        </label>
        <label className="text-sm">
          終了日
          <input
            type="date"
            name="to"
            defaultValue={data.to}
            className="mt-1 block rounded border p-2"
          />
        </label>
        <label className="text-sm">
          区切り
          <select
            aria-label="区切り"
            name="bucket"
            defaultValue={data.bucket ?? "day"}
            className="mt-1 block rounded border p-2"
          >
            <option value="day">日別</option>
            <option value="hour">時間帯別</option>
          </select>
        </label>
        <label className="text-sm">
          記録の種類
          <select
            aria-label="記録の種類"
            name="origin"
            defaultValue={data.origin ?? "operated"}
            className="mt-1 block rounded border p-2"
          >
            {Object.entries(originName).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white">
          販売推移を表示
        </button>
      </form>
      {data.message && (
        <p role="status" className="rounded-lg bg-amber-50 p-3">
          {data.message}
        </p>
      )}
      {data.periods && current && previous && (
        <>
          <div className="rounded-xl border border-[var(--line)] p-4 text-sm">
            <p>
              対象：{data.selected!.product_name}／{originName[data.origin!]}
            </p>
            <p>
              実施期間：{time(data.periods.current.start)} 〜{" "}
              {time(data.periods.current.end)}（終了時刻は含まない）
            </p>
            <p>
              比較期間：{time(data.periods.previous.start)} 〜{" "}
              {time(data.periods.previous.end)}（終了時刻は含まない）
            </p>
            <p className="mt-2 text-[var(--muted)]">
              販促の期間・現在時刻で絞っています。入力した終了日は含み、表示期間は最大31日です。
            </p>
          </div>
          <div className="rounded-xl border border-[var(--line)] p-4">
            <p className="font-bold" role="status">
              {data.canCompare
                ? "両期間の記録範囲を確認済みです。"
                : "比較できません（販売の記録範囲が未確認です）。"}
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              前後の比較であり、販促が売上の増減を引き起こしたことを示すものではありません。
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <caption className="sr-only">
                  観測された販売と同じ長さの直前期間の比較
                </caption>
                <thead>
                  <tr>
                    <th className="p-2">指標</th>
                    <th className="p-2">実施期間の観測値</th>
                    <th className="p-2">比較期間の観測値</th>
                    <th className="p-2">増減</th>
                    <th className="p-2">増減率</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row) => {
                    const delta = salesDifference(
                      row.current,
                      row.previous,
                      !!data.canCompare,
                    );
                    return (
                      <tr key={row.label}>
                        <th className="p-2">{row.label}</th>
                        <td className="p-2">
                          {current.hasObservations || current.complete
                            ? row.current.toLocaleString("ja-JP") + row.unit
                            : "記録なし（0とは限りません）"}
                        </td>
                        <td className="p-2">
                          {previous.hasObservations || previous.complete
                            ? row.previous.toLocaleString("ja-JP") + row.unit
                            : "記録なし（0とは限りません）"}
                        </td>
                        <td className="p-2">
                          {delta
                            ? (delta.difference > 0 ? "+" : "") +
                              delta.difference.toLocaleString("ja-JP") +
                              row.unit
                            : "比較できません"}
                        </td>
                        <td className="p-2">
                          {delta
                            ? delta.percent === null
                              ? "算出できません（比較元が0）"
                              : (delta.percent > 0 ? "+" : "") +
                                delta.percent.toFixed(1) +
                                "%"
                            : "比較できません"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {!current.hasObservations && (
            <p role="status">
              {current.complete
                ? "この期間の対象商品の販売は0件です。"
                : "この期間に観測した販売記録はありません。販売0件とは断定できません。"}
            </p>
          )}
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <SalesChart
              points={current.points}
              metric="quantity"
              title="販売数の推移（点）"
            />
            <SalesChart
              points={current.points}
              metric="amount"
              title="販売金額の推移（円）"
            />
          </div>
          <details className="rounded-xl border border-[var(--line)] p-4">
            <summary className="cursor-pointer font-bold">
              日別・時間帯別の集計表
            </summary>
            <div className="mt-3 max-h-96 overflow-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">区間の開始（日本時間）</th>
                    <th className="p-2">観測販売数</th>
                    <th className="p-2">観測金額</th>
                  </tr>
                </thead>
                <tbody>
                  {current.points.map((p) => (
                    <tr key={p.at}>
                      <th className="whitespace-nowrap p-2">{time(p.at)}</th>
                      <td className="p-2">
                        {p.quantity === null ? "記録なし" : p.quantity + "点"}
                      </td>
                      <td className="p-2">
                        {p.amount === null ? "記録なし" : yen(p.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
