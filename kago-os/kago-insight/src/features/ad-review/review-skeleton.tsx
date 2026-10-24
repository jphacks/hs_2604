/**
 * 読み込み中の骨組み。読み込み後と同じ2カラムの形にして、
 * 切り替わったときに画面が動かないようにする。
 */
export function ReviewSkeleton() {
  return (
    <div aria-busy="true" aria-label="読み込み中">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="grid gap-3 self-start">
          <div className="h-4 w-28 animate-pulse rounded bg-[var(--line)]" />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
        </div>
        <div className="self-start rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="aspect-[16/10] w-full animate-pulse rounded bg-[var(--line)]" />
          <div className="mt-4 h-6 w-2/3 animate-pulse rounded bg-[var(--line)]" />
          <div className="mt-4 grid gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="grid grid-cols-[7rem_1fr] gap-2">
                <div className="h-4 animate-pulse rounded bg-[var(--line)]" />
                <div className="h-4 w-3/5 animate-pulse rounded bg-[var(--line)]" />
              </div>
            ))}
          </div>
          <div className="mt-5 flex gap-2">
            <div className="h-10 w-28 animate-pulse rounded bg-[var(--line)]" />
            <div className="h-10 w-28 animate-pulse rounded bg-[var(--line)]" />
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-3">
        <div className="h-4 w-40 animate-pulse rounded bg-[var(--line)]" />
        <SkeletonCard lines={2} />
      </section>
    </div>
  );
}

function SkeletonCard({ lines }: { lines: number }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
      <div className="h-5 w-1/2 animate-pulse rounded bg-[var(--line)]" />
      {Array.from({ length: lines - 1 }).map((_, i) => (
        <div
          key={i}
          className="mt-2 h-4 animate-pulse rounded bg-[var(--line)]"
          style={{ width: `${70 - i * 15}%` }}
        />
      ))}
    </div>
  );
}
