export function MetricsSkeleton() {
  return (
    <div aria-busy="true" aria-label="読み込み中">
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
            <div className="h-4 w-20 animate-pulse rounded bg-[var(--line)]" />
            <div className="mt-3 h-8 w-16 animate-pulse rounded bg-[var(--line)]" />
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="h-4 w-32 animate-pulse rounded bg-[var(--line)]" />
        <div className="mt-4 grid gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 w-full animate-pulse rounded bg-[var(--line)]" />
          ))}
        </div>
      </div>
      <div className="mt-6 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="h-4 w-40 animate-pulse rounded bg-[var(--line)]" />
        <div className="mt-4 grid gap-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-10 w-full animate-pulse rounded bg-[var(--line)]" />
          ))}
        </div>
      </div>
    </div>
  );
}
