"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Pool, Window } from "@/lib/market/gecko";
import { PoolTable } from "@/components/market/PoolTable";
import { Card } from "@/components/primitives/Card";
import { clsx } from "@/lib/clsx";

/**
 * A board that refreshes itself.
 *
 * Fetches its own rows from `/api/pools` rather than calling `router.refresh()`.
 * A route refresh re-runs every server component on the page, so pressing
 * refresh on the launch feed was also refetching the screener and the trending
 * board to update one table.
 *
 * Server-rendered rows arrive as `initialPools`, so the board is populated on
 * first paint and the fetch only ever replaces what is already there.
 */
export function LiveBoard({
  feed,
  initialPools,
  window: chartWindow = "1h",
  sort = "age",
  emptyLabel,
}: {
  feed: "new" | "trending" | "top";
  initialPools: Pool[];
  window?: Window;
  sort?: "change" | "volume" | "age";
  emptyLabel?: string;
}) {
  const [pools, setPools] = useState(initialPools);
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState<number | null>(null);
  const [, tick] = useState(0);
  const floor = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(floor.current), []);

  // Keeps the "12s ago" honest without a timer per board on the page.
  useEffect(() => {
    if (at === null) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [at]);

  const refresh = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    // A spinner that resolves before the eye registers it reads as a control
    // that did nothing, so the busy state has a floor.
    floor.current = setTimeout(() => setBusy(false), 600);
    try {
      const res = await fetch(`/api/pools?feed=${feed}`, { cache: "no-store" });
      if (res.ok) {
        setPools((await res.json()) as Pool[]);
        setAt(Date.now());
      }
    } catch {
      // Upstream unreachable. The rows already on screen stay, which is the
      // right outcome: stale data beats an empty table.
    }
  }, [busy, feed]);

  const ago =
    at === null ? null : Math.max(0, Math.round((Date.now() - at) / 1000));

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-end gap-3 border-b border-line-soft px-3 py-2">
        <div className="flex items-center gap-2.5">
          {ago !== null && (
            <span className="tnum text-micro text-ink-3">
              {ago < 60 ? `${ago}s ago` : `${Math.floor(ago / 60)}m ago`}
            </span>
          )}
          <button
            type="button"
            onClick={refresh}
            disabled={busy}
            aria-label="Refresh"
            aria-busy={busy}
            className={clsx(
              "flex h-8 w-8 items-center justify-center rounded-md border border-line",
              "text-ink-2 transition-colors duration-100",
              "hover:border-green hover:text-green disabled:opacity-60",
            )}
          >
            <svg width="13" height="13" viewBox="0 0 12 12" aria-hidden="true">
              {/* An arc with an arrowhead. A full ring would not read as
                  rotating once it starts to spin. */}
              <path
                d="M10.5 6a4.5 4.5 0 1 1-1.6-3.44"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                className={clsx(busy && "spin")}
                style={{ transformOrigin: "center" }}
              />
              <path
                d="M10.6 1.2v2.6H8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={clsx(busy && "spin")}
                style={{ transformOrigin: "center" }}
              />
            </svg>
          </button>
        </div>
      </div>

      <PoolTable
        pools={pools}
        window={chartWindow}
        sort={sort}
        emptyLabel={emptyLabel}
      />
    </Card>
  );
}
