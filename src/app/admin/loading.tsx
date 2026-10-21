export default function AdminLoading() {
  return (
    <div className="space-y-6" aria-label="Loading admin page">
      <div className="space-y-2 border-b border-zinc-200 pb-4">
        <div className="h-7 w-48 animate-pulse rounded bg-zinc-200" />
        <div className="h-3 w-80 animate-pulse rounded bg-zinc-100" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-lg border border-zinc-200 bg-white"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg border border-zinc-200 bg-white" />
    </div>
  );
}
