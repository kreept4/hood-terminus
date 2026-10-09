import { rateLimit, clientKey, tooManyRequests } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { getCandles, type Timeframe } from "@/lib/market/gecko";

/**
 * Candles for the chart's timeframe switcher.
 *
 * A route rather than a server action because the chart calls it on every
 * timeframe change and wants a plain cacheable GET. The pool address and
 * timeframe are both validated here: they are interpolated into an upstream
 * URL, and an unchecked value there is a request-forgery hole.
 */

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "12h", "1d"] as const;

export async function GET(request: Request) {
  const limited = rateLimit(clientKey(request, "candles"), 60, 60000);
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const { searchParams } = new URL(request.url);
  const pool = searchParams.get("pool") ?? "";
  const tf = searchParams.get("tf") ?? "1h";

  if (!/^0x[0-9a-fA-F]{40}$/.test(pool)) {
    return NextResponse.json({ error: "Invalid pool address" }, { status: 400 });
  }
  if (!TIMEFRAMES.includes(tf as Timeframe)) {
    return NextResponse.json({ error: "Invalid timeframe" }, { status: 400 });
  }

  const candles = await getCandles(pool, tf as Timeframe);
  return NextResponse.json(candles, {
    headers: { "cache-control": "public, s-maxage=20, stale-while-revalidate=60" },
  });
}
