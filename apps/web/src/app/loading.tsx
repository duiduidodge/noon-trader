export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="h-16 animate-pulse rounded-lg border border-border/40 bg-card/50" />
      <div className="h-40 animate-pulse rounded-lg border border-border/40 bg-card/50" />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="h-[520px] animate-pulse rounded-lg border border-border/40 bg-card/50" />
        <div className="h-[360px] animate-pulse rounded-lg border border-border/40 bg-card/50" />
      </div>
    </div>
  );
}
