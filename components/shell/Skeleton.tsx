/**
 * Stand-ins for content that has not arrived.
 *
 * Shared so every loading state looks like the same product. The point is not
 * decoration: a route with no loading boundary leaves the previous page on
 * screen, unchanged, until the server answers, and silence after a click reads
 * as a broken link rather than as waiting.
 */

/** One rectangle. `className` carries the size, so it matches what it stands in for. */
export function Block({ className }: { className: string }) {
  return <div className={`animate-pulse bg-surface-2 ${className}`} />;
}

/**
 * A page of rows, which is what most of this product is.
 *
 * Widths vary down the rows on purpose. A column of identical bars reads as a
 * graphic; uneven ones read as text that has not loaded yet.
 */
export function RowsSkeleton({
  title,
  rows = 8,
}: {
  title: string;
  rows?: number;
}) {
  const widths = ["w-32", "w-24", "w-40", "w-28", "w-36", "w-24"];
  return (
    <div className="gutter py-8 md:py-10" aria-busy="true">
      <Block className="h-8 w-48" />
      <div className="mt-8 divide-y divide-line-soft border-y border-line-soft">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 py-3.5">
            <Block className="h-8 w-8 shrink-0 rounded-full" />
            <Block className={`h-4 ${widths[i % widths.length]}`} />
            <Block className="ml-auto h-4 w-20" />
            <Block className="hidden h-4 w-16 sm:block" />
          </div>
        ))}
      </div>
      <span className="sr-only">{title}</span>
    </div>
  );
}
