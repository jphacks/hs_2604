import type { SalesPoint } from "@/lib/sales-trends";
export function SalesChart({
  points,
  metric,
  title,
}: {
  points: SalesPoint[];
  metric: "quantity" | "amount";
  title: string;
}) {
  const width = 720,
    height = 220,
    pad = 30,
    max = Math.max(1, ...points.map((p) => p[metric] ?? 0));
  const x = (i: number) =>
      pad + (i * (width - 2 * pad)) / Math.max(1, points.length - 1),
    y = (v: number) => height - pad - (v * (height - 2 * pad)) / max;
  let path = "",
    previous = false;
  points.forEach((p, i) => {
    const v = p[metric];
    if (v === null) {
      previous = false;
      return;
    }
    path += (previous ? " L" : " M") + x(i).toFixed(2) + "," + y(v).toFixed(2);
    previous = true;
  });
  return (
    <figure className="min-w-0 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <figcaption className="font-bold">{title}</figcaption>
      <svg
        viewBox={"0 0 " + width + " " + height}
        role="img"
        aria-label={title + "。記録範囲が未確認の空区間は線でつなぎません。"}
        className="mt-3 w-full"
      >
        <line
          x1={pad}
          y1={height - pad}
          x2={width - pad}
          y2={height - pad}
          stroke="currentColor"
          opacity=".3"
        />
        <text x={0} y={pad} fontSize="12">
          {max.toLocaleString("ja-JP")}
        </text>
        <text x={8} y={height - pad} fontSize="12">
          0
        </text>
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="3" />
        {points.map((p, i) =>
          p[metric] === null ? null : (
            <circle
              key={p.at}
              cx={x(i)}
              cy={y(p[metric]!)}
              r="3"
              fill="var(--accent)"
            />
          ),
        )}
      </svg>
      <div className="flex justify-between text-xs text-[var(--muted)]">
        {[points[0], points.at(-1)].map((p, i) => (
          <span key={i}>
            {p
              ? new Date(p.at).toLocaleString("ja-JP", {
                  timeZone: "Asia/Tokyo",
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : ""}
          </span>
        ))}
      </div>
      <p className="text-xs text-[var(--muted)]">
        左から右へ日本時間の順。点の詳細は下の集計表で確認できます。
      </p>
    </figure>
  );
}
