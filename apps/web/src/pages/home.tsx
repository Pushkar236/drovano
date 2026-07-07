/**
 * Home canvas. Until the object graph lands (M2), the honest state of
 * this surface is a designed first-run empty state (voice.md §2).
 */
export function HomePage() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight text-text-primary">
          Welcome to Drovano
        </h1>
        <p className="mt-2 text-md text-text-secondary">
          Your workspace is ready. Records, deals, and meetings arrive with the next milestones —
          everything you see already runs on the real platform.
        </p>
        <p className="mt-4 text-base text-text-muted">
          Press{' '}
          <kbd className="rounded-sm border border-border-strong px-1 font-mono text-sm">
            Ctrl K
          </kbd>{' '}
          to open the command surface.
        </p>
      </div>
    </div>
  );
}
