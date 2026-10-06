import { Suspense } from "react";
import Link from "next/link";
import { clsx } from "@/lib/clsx";
import { Hero } from "@/components/discover/Hero";
import { PageField } from "@/components/visual/PageField";
import { SmoothScroll } from "@/components/visual/SmoothScroll";
import { GasMonitor } from "@/components/market/GasMonitor";
import { CreatePitch } from "@/components/create/CreatePitch";
import { getCurveTokens } from "@/lib/launchpad/curve";
import { Screener } from "@/components/discover/Screener";
import { Section } from "@/components/primitives/Section";
import {  IconScreener,
} from "@/components/primitives/SectionIcons";
import { Card } from "@/components/primitives/Card";
import { Reveal } from "@/components/primitives/Reveal";
import { ChainStats } from "@/components/market/ChainStats";
import { IndexedResults } from "@/components/market/IndexedResults";
import {
  getNewPools,
  getTopPools,
  getTrendingPools,
  screen,  WINDOWS,
  type Pool,
  type ScreenSort,
  type Window,
} from "@/lib/market/gecko";
import {
  searchIndexedPools,  indexedPoolCount,
} from "@/lib/market/pool-index";

const SORT_LABELS: Record<ScreenSort, string> = {
  curve: "On the curve",
  trending: "Trending",
  gainers: "Gainers",
  losers: "Losers",
  new: "New pairs",
  volume: "Volume",
  liquidity: "Liquidity",
};

function parseSort(value: string | undefined): ScreenSort {
  return value && value in SORT_LABELS ? (value as ScreenSort) : "trending";
}

function parseWindow(value: string | undefined): Window {
  return WINDOWS.includes(value as Window) ? (value as Window) : "1h";
}

function parseLiquidity(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 5_000;
}

type Props = {
  searchParams: Promise<{
    sort?: string;
    t?: string;
    liq?: string;
    q?: string;
    pair?: string;
    all?: string;
  }>;
};

/**
 * Rebuilt every minute.
 *
 * The pair count and the boards are both read at render time, and the pool
 * index behind that count now grows on its own every hour. Without this the
 * page would keep serving whatever it built the first time somebody asked for
 * it, and a number that is meant to say "this is how big the chain is" would
 * be frozen at whatever it was that morning.
 */
export const revalidate = 60;

export default async function DiscoverPage({ searchParams }: Props) {
  const { sort: rawSort, t, liq, q, pair, all } = await searchParams;
  const sort = parseSort(rawSort);
  const window = parseWindow(t);
  const minLiquidity = parseLiquidity(liq);
  const query = typeof q === "string" ? q : "";
  /**
   * The board shows a readable 25 by default and everything on request.
   *
   * A screener that silently truncates is a screener you cannot trust: the
   * filters say one thing and the table shows a slice of it without saying so.
   */
  const showAll = all === "1";
  const quote = typeof pair === "string" ? pair : "";

  // The screener and the launch feed draw on different populations. Sorting the
  // top-volume pools by age would only surface launches that already made it,
  // which is the opposite of what someone hunting new pairs wants.
  const [top, fresh, trending] = await Promise.all([
    getTopPools(),
    getNewPools(),
    getTrendingPools(),
  ]);

  /**
   * A search looks across everything, not just the board in view.
   *
   * Boards are a way of browsing. Once somebody types a ticker they have said
   * what they want, and finding it only if it happens to be on the selected
   * board is the screener hiding an answer it holds.
   */
  /**
   * Which population a board is drawn from.
   *
   * Trending and New are their own feeds upstream; the rest are orderings over
   * the busiest pools. Sorting the top-volume feed by age would only ever
   * surface launches that already made it, which is the opposite of what
   * somebody looking at New wants.
   */
  /**
   * The chosen board, or the best thing we have if it came back empty.
   *
   * Feeds fail independently against a rate-limited upstream, and trending is a
   * single request, so it is the one that loses. Making it the default board
   * meant one refused request emptied the landing page.
   *
   * An empty board is never the right answer while we are holding pools that
   * would fill it. Falling back is not hiding the failure: the rows are real,
   * they are simply ordered by what we could actually fetch.
   */
  const chosen =
    sort === "new" ? fresh : sort === "trending" ? trending : top;
  const board =
    chosen.length > 0 ? chosen : trending.length > 0 ? trending : top.length > 0 ? top : fresh;
  /**
   * Every pool we hold, used for the quote-asset list and for searching.
   *
   * The pairing filter was built from whichever board happened to be selected,
   * so an asset that only appears on the trending feed was missing from the
   * list of things you could filter by. The filter has to know about every
   * pairing we know about, not the ones on screen.
   */
  const everything = dedupe([...top, ...fresh, ...trending]);
  const population = query.trim() ? everything : board;

  const rows = screen(population, {
    window,
    sort,
    minLiquidityUsd: minLiquidity,
    limit: showAll ? 250 : 50,
    query,
    quote,
  });

  /**
   * Whatever the provider's hundred pools did not contain.
   *
   * The feeds hold the busiest hundred, and the chain has over three thousand.
   * A search that only looked at the hundred answered "nothing found" for
   * tokens that plainly exist, which is the worst answer a search can give:
   * it is wrong, and it reads as the token not existing rather than as us not
   * looking.
   *
   * So a search that comes up short falls through to our own index. Those
   * results carry no price or volume, because the index is a directory rather
   * than a market data feed, and they are shown as what they are.
   */
  const known = new Set(rows.map((r) => r.address.toLowerCase()));

  /**
   * The rest of the chain, for a search only.
   *
   * Searching is the case where reaching past the feed is unambiguous:
   * somebody named a token, we either have it or we do not, and finding it
   * without a price beats saying it does not exist.
   *
   * View all tried the same and was wrong. It stacked two hundred unpriced
   * pairs under twenty priced ones, which is two kinds of data in what looks
   * like one list, and the honest reading was "what are these and why have
   * they no numbers". A board should be one thing.
   */
  const alsoFound = query.trim()
    ? (await searchIndexedPools(query, 40)).filter(
        (p) => !known.has(p.address.toLowerCase()),
      )
    : [];
  const [curveTokens, poolCount] = await Promise.all([
    getCurveTokens(24),
    indexedPoolCount(),
  ]);

  return (
    <div>
      {/* This page only. The scroll wheel belongs to the browser everywhere
          the reader is working rather than being sold to. */}
      <SmoothScroll />
      <PageField />
      <Hero />
      {/* Directly under the hero: four live numbers answering whether anything
          is actually happening on this chain, before any board has to be read. */}
      <ChainStats initial={top} poolCount={poolCount} />

      <CreatePitch />

      <Section
        id="screener"
        title="Tokens"
        icon={<IconScreener />}
        aside={
          <div className="flex items-center gap-4">
            {(showAll || rows.length >= 50) && (
            <ViewAll
            showingAll={showAll}
            href={buildQuery({ sort, t: window, liq: minLiquidity, q: query, pair: quote, all: showAll ? "" : "1" })}
            />
            )}
          </div>
        }
      >
        <Reveal className="mb-4">
          <GasMonitor />
        </Reveal>
        <Reveal>
          <Card className="overflow-hidden">
            {/* The feeds are fetched once here and filtered in the browser, so
                changing a board or a setting costs nothing. Only search still
                reaches the server, because it can fall through to our own pool
                index. See `Screener`. */}
            <Suspense
              fallback={<div className="h-14 border-b border-line-soft" />}
            >
              <Screener
                top={top}
                fresh={fresh}
                trending={trending}
                curveTokens={curveTokens}
                query={query}
                showAll={showAll}
                initialSort={sort}
                initialWindow={window}
                initialMinLiquidity={minLiquidity}
                initialQuote={quote}
              />
            </Suspense>
          </Card>
          {/* Anything our own index knows about that the feed did not. */}
          <IndexedResults pools={alsoFound} />
        </Reveal>
      </Section>

    </div>
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




/** Keeps the current filters when toggling how many rows are shown. */
function buildQuery(params: Record<string, string | number>): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== "" && value !== undefined) next.set(key, String(value));
  }
  return `/?${next.toString()}#screener`;
}

/**
 * The way to the unabridged board, in the section header.
 *
 * It sat under the table before, which put it past twenty-five rows of
 * scrolling: a control for "there is more than this" that you could only find
 * after reading all of this. Opposite the heading it is visible the moment the
 * section is, and it is quiet enough not to compete with it.
 */
function ViewAll({ showingAll, href }: { showingAll: boolean; href: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      className="group inline-flex items-center gap-1.5 text-body text-ink-3 transition-colors duration-150 hover:text-green"
    >
      {showingAll ? "Show less" : "View all"}
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={clsx(
          "transition-transform duration-150",
          showingAll
            ? "rotate-180 group-hover:-translate-x-0.5"
            : "group-hover:translate-x-0.5",
        )}
      >
        <path d="M2.5 6h7M6.5 3l3 3-3 3" />
      </svg>
    </Link>
  );
}
