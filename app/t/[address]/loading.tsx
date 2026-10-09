/**
 * What a token page looks like while it is being fetched.
 *
 * Without this file Next has no boundary to show, so a click on a token held
 * the previous page on screen, with nothing moving, until the server had
 * finished talking to the market API. The page was not slow so much as silent,
 * and silence after a click reads as a broken link.
 *
 * The shape matches the real header deliberately: same back link, same logo
 * circle, same two lines of type. Arriving at a layout that then rearranges
 * itself is worse than arriving at a spinner, because the eye has already
 * started reading.
 */
export default function Loading() {
  return (
    <div className="gutter py-8 md:py-10" aria-busy="true">
      <span className="text-micro text-ink-3">Back to markets</span>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Block className="h-11 w-11 rounded-full" />
            <Block className="h-7 w-28" />
            <Block className="h-5 w-14" />
          </div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <Block className="h-8 w-40" />
            <Block className="h-5 w-20" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Block className="h-11 w-32 rounded-md" />
          <Block className="h-11 w-28 rounded-md" />
        </div>
      </header>

      {/* The chart, which is the tallest thing on the page and so the one
          whose absence would move everything else when it arrives. */}
      <Block className="mt-8 h-[320px] w-full rounded-lg md:h-[420px]" />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Block className="h-44 w-full rounded-lg" />
        <Block className="h-44 w-full rounded-lg" />
      </div>

      <span className="sr-only">Loading this token</span>
    </div>
  );
}

/** One grey rectangle standing in for something that has not arrived. */
function Block({ className }: { className: string }) {
  return <div className={`animate-pulse bg-surface-2 ${className}`} />;
}
