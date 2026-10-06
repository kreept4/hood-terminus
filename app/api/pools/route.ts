import { rateLimit, clientKey, tooManyRequests } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { getNewPools, getTrendingPools, getTopPools } from "@/lib/market/gecko";

/**
 * Board rows on their own.
 *
 * Exists so a board can refresh itself without the page around it re-rendering.
 * `router.refresh()` would re-run every server component on the route, which
 * for the launch feed means refetching the screener and the trending board to
 * update one table.
 */
const FEEDS = {
  new: getNewPools,
  trending: getTrendingPools,
  top: getTopPools,
} as const;

type Feed = keyof typeof FEEDS;

export async function GET(request: Request) {
  const limited = rateLimit(clientKey(request, "pools"), 60, 60000);
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const { searchParams } = new URL(request.url);
  const feed = searchParams.get("feed") ?? "new";

  if (!Object.prototype.hasOwnProperty.call(FEEDS, feed)) {
    return NextResponse.json({ error: "Unknown feed" }, { status: 400 });
  }

  const pools = await FEEDS[feed as Feed]();
  return NextResponse.json(pools, {
    headers: { "cache-control": "no-store" },
  });
}
