'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="mx-auto mt-10 max-w-xl rounded-lg border border-border/40 bg-card p-6 text-center">
      <h2 className="font-display text-lg font-semibold">Unable to load feed</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <button
        onClick={reset}
        className="mt-4 rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary"
      >
        Retry
      </button>
    </div>
  );
}
