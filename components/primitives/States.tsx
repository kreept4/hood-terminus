import { clsx } from "@/lib/clsx";

export function Empty({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  return (
    <div className={clsx("px-4 py-10 text-body text-ink-3", className)}>
      {title}
    </div>
  );
}

/** The honest state for anything waiting on the indexer. */
export function AwaitingData({
  what,
  className,
}: {
  what: string;
  className?: string;
}) {
  return (
    <div
      className={clsx("flex items-center gap-2 px-4 py-10", className)}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-ink-3" />
      <span className="text-body text-ink-3">{what}</span>
    </div>
  );
}

export function ErrorPanel({
  title = "Failed",
  onRetry,
  className,
}: {
  title?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-center gap-3 px-4 py-10", className)}>
      <span className="text-body text-red">{title}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="tap-44 rounded-sm border border-line px-2.5 py-1 text-small text-ink-2 transition-colors duration-100 hover:border-green-line hover:text-ink"
        >
          Retry
        </button>
      )}
    </div>
  );
}

/** Skeletons match final row height exactly, so nothing shifts on arrival. */
export function SkeletonRows({
  rows = 5,
  height = 33,
}: {
  rows?: number;
  height?: number;
}) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="border-b border-line-soft last:border-b-0"
          style={{ height }}
        >
          <div className="mx-3 mt-3 h-2.5 w-1/3 rounded-xs bg-line-soft" />
        </div>
      ))}
    </div>
  );
}

/**
 * Sits next to any figure derived from a scheduled job. Presenting stale data
 * as live is an integrity failure, not a cosmetic one.
 */
export function StaleDot({ stale }: { stale: boolean }) {
  if (!stale) return null;
  return (
    <span
      title="Older than its refresh interval"
      className="ml-1.5 inline-block h-1 w-1 rounded-full bg-red align-middle"
    />
  );
}
