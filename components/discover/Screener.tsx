"use client";

import { useEffect, useMemo, useState } from "react";
import { Filters } from "@/components/discover/Filters";
import { PoolTable } from "@/components/market/PoolTable";
import { CurveBoard } from "@/components/create/CurveBoard";
import {
  screen,
  quoteAssets,
  type Pool,
  type ScreenSort,
  type Window,
} from "@/lib/market/gecko";
import type { CurveToken } from "@/lib/launchpad/curve";

/**
 * The board, filtered in the browser.
 *
 * Every control here used to write to the URL, which re-ran the page on the
 * server and refetched three upstream feeds. Choosing a window meant waiting on
 * GeckoTerminal to answer before the table changed, so a setting that is
 * arithmetic over rows already on screen read as a page load.
 *
 * None of it needs the server. The three feeds are fetched once and handed down,
 * and `screen` is a pure function over them: sort, window, minimum liquidity and
 * pairing are all decided from data the browser is already holding. So the
 * filters are state here and the table recomputes in place.
 *
 * The URL is still kept current, through `history.replaceState` rather than a
 * navigation, so a view can still be bookmarked or sent to someone and the
 * server still renders the right board on a cold request. It just no longer
 * costs a round trip to change one.
 *
 * Search is the exception and stays on the URL. A query that the feeds cannot
 * answer falls through to our own pool index, which only the server can read,
 * so that one genuinely needs the trip.
 */
export function Screener({
  top,
  fresh,
  trending,
  curveTokens,
  query,
  showAll,
  initialSort,
  initialWindow,
  initialMinLiquidity,
  initialQuote,
}: {
  top: Pool[];
  fresh: Pool[];
  trending: Pool[];
  curveTokens: CurveToken[];
  /** Server-owned, because a search can reach past the feeds. */
  query: string;
  showAll: boolean;
  initialSort: ScreenSort;
  initialWindow: Window;
  initialMinLiquidity: number;
  initialQuote: string;
}) {
  const [sort, setSort] = useState<ScreenSort>(initialSort);
  const [timeWindow, setTimeWindow] = useState<Window>(initialWindow);
  const [minLiquidity, setMinLiquidity] = useState(initialMinLiquidity);
  const [quote, setQuote] = useState(initialQuote);

  // The initial values seed state and are deliberately not synced back. These
  // four controls no longer navigate, so the only way they change upstream is a
  // cold request, which mounts this fresh anyway. Mirroring them in an effect
  // would just be a second source of truth fighting the first.

  const everything = useMemo(
    () => dedupe([...top, ...fresh, ...trending]),
    [top, fresh, trending],
  );

  const quotes = useMemo(() => quoteAssets(everything), [everything]);

  /**
   * Which population a board is drawn from, and the same fallback the server
   * used: a feed that came back empty should borrow rows rather than show none,
   * because the rows are real and only their ordering is compromised.
   */
  const rows = useMemo(() => {
    const chosen = sort === "new" ? fresh : sort === "trending" ? trending : top;
    const board =
      chosen.length > 0
        ? chosen
        : trending.length > 0
          ? trending
          : top.length > 0
            ? top
            : fresh;
    const population = query.trim() ? everything : board;

    return screen(population, {
      window: timeWindow,
      sort,
      minLiquidityUsd: minLiquidity,
      limit: showAll ? 250 : 50,
      query,
      quote,
    });
  }, [
    sort,
    timeWindow,
    minLiquidity,
    quote,
    query,
    showAll,
    top,
    fresh,
    trending,
    everything,
  ]);

  // Keeps the address bar honest without navigating. Defaults are left out so a
  // bare URL stays bare.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const put = (key: string, value: string, fallback: string) => {
      if (value === fallback) params.delete(key);
      else params.set(key, value);
    };

    put("sort", sort, "trending");
    put("t", timeWindow, "1h");
    put("liq", String(minLiquidity), "5000");
    put("pair", quote, "");

    const search = params.toString();
    const next = `${window.location.pathname}${search ? `?${search}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, "", next);
    }
  }, [sort, timeWindow, minLiquidity, quote]);

  return (
    <>
      <Filters
        sort={sort}
        window={timeWindow}
        minLiquidity={minLiquidity}
        quote={quote}
        quotes={quotes}
        onSort={setSort}
        onWindow={setTimeWindow}
        onLiquidity={setMinLiquidity}
        onQuote={setQuote}
      />

      {/* Tokens launched here are a different shape from pools on the chain, so
          the board swaps rather than the table trying to render both. It is
          still one section and one set of tabs. */}
      {sort === "curve" ? (
        <div className="p-3">
          <CurveBoard tokens={curveTokens} />
        </div>
      ) : (
        <PoolTable
          pools={rows}
          window={timeWindow}
          sort={sort === "volume" ? "volume" : sort === "new" ? "age" : "change"}
          emptyLabel="Nothing matches these filters"
        />
      )}
    </>
  );
}

/** One entry per pool, keeping the first seen. */
function dedupe(pools: Pool[]): Pool[] {
  const seen = new Set<string>();
  const out: Pool[] = [];
  for (const p of pools) {
    if (seen.has(p.address)) continue;
    seen.add(p.address);
    out.push(p);
  }
  return out;
}
