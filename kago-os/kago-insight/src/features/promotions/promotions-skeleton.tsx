export function PromotionsSkeleton() {
  return (
    <div aria-busy="true" aria-label="読み込み中">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="grid gap-3 self-start">
          <div className="h-4 w-32 animate-pulse rounded bg-[var(--line)]" />
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
            <div className="h-5 w-2/3 animate-pulse rounded bg-[var(--line)]" />
            <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-[var(--line)]" />
          </div>
          <div className="h-10 w-full animate-pulse rounded bg-[var(--line)]" />
        </div>
        <div className="self-start rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="mt-3 first:mt-0">
              <div className="h-4 w-24 animate-pulse rounded bg-[var(--line)]" />
              <div className="mt-1.5 h-9 w-full animate-pulse rounded bg-[var(--line)]" />
            </div>
          ))}
          <div className="mt-5 h-10 w-32 animate-pulse rounded bg-[var(--line)]" />
        </div>
      </section>
    </div>
  );
}
