import { clsx } from "@/lib/clsx";

/**
 * One labelled figure.
 *
 * The value sits above its caption rather than beside it, because a row of
 * these is scanned down the values first and only then read for what they are.
 * A missing value renders as missing and is never rounded to zero.
 */
export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={clsx("min-w-0", className)}>
      <div className="tnum truncate text-lead font-medium text-ink">{value}</div>
      <div className="mt-1 truncate text-micro text-ink-3" title={hint ?? label}>
        {label}
      </div>
    </div>
  );
}

/** The row a header carries. Wraps rather than scrolls on a narrow screen. */
export function StatRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 lg:grid-cols-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
