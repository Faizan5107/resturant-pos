export default function CashierLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-5" aria-label="Loading cashier page">
      <div className="space-y-2 border-b border-zinc-200 pb-4">
        <div className="h-6 w-40 animate-pulse rounded bg-zinc-200" />
        <div className="h-3 w-72 animate-pulse rounded bg-zinc-100" />
      </div>
      <div className="h-14 animate-pulse rounded-lg border border-zinc-200 bg-white" />
      <div className="h-64 animate-pulse rounded-lg border border-zinc-200 bg-white" />
    </div>
  );
}
