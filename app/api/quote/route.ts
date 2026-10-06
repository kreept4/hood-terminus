import { rateLimit, clientKey, tooManyRequests } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { quotePool } from "@/lib/market/quote";

/**
 * A swap quote for one pool.
 *
 * Server-side because the RPC URL carries a key. Both address parameters are
 * validated before they reach a call: they are interpolated into calldata and
 * an unchecked value there is a request-forgery hole.
 */
export async function GET(request: Request) {
  const limited = rateLimit(clientKey(request, "quote"), 120, 60_000);
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const { searchParams } = new URL(request.url);
  const pool = searchParams.get("pool") ?? "";
  const tokenIn = searchParams.get("tokenIn") ?? "";
  const amount = searchParams.get("amount") ?? "";

  if (!/^0x[0-9a-fA-F]{40}$/.test(pool)) {
    return NextResponse.json({ error: "Invalid pool" }, { status: 400 });
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(tokenIn)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }
  if (!/^\d{1,40}$/.test(amount)) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const result = await quotePool(pool, tokenIn, BigInt(amount));
  if (!result) {
    return NextResponse.json({ error: "No quote" }, { status: 503 });
  }

  const { state, quote } = result;

  // BigInt does not survive JSON. Strings preserve every digit, which a float
  // would not for a wei-denominated amount.
  return NextResponse.json({
    pool: state.address,
    token0: state.token0,
    token1: state.token1,
    fee: state.fee,
    liquidity: state.liquidity.toString(),
    quote: quote
      ? {
          amountIn: quote.amountIn.toString(),
          amountOut: quote.amountOut.toString(),
          priceImpactPct: quote.priceImpactPct,
          feePct: quote.feePct,
          beyondRange: quote.beyondRange,
        }
      : null,
  });
}
