import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { verifyToken } from "@/lib/verify";
import { rateLimit, clientKey, tooManyRequests } from "@/lib/rate-limit";

/**
 * GET /api/verify/:address
 *
 * Runs Verify for one token and returns the report. Takes an address from
 * anyone and fans out to a simulation plus a handful of RPC and GeckoTerminal
 * reads, so responses are cached at the edge for a minute on top of the
 * in-process cache in lib/verify.
 *
 * This is the one route that answers cross-origin. Verify is the piece of this
 * product worth other people building on, and a check that cannot be called
 * from somebody else's page is a check nobody else can use. Thirty a minute per
 * address is enough to drive a page and not enough to turn a free upstream tier
 * into somebody else's budget.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

/** Thirty a minute per IP, per the build plan. */
const LIMIT = 30;
const WINDOW_MS = 60_000;

/**
 * Open to any origin, GET only.
 *
 * Deliberately narrower than it looks. There is nothing to authorise here: the
 * route reads public chain state and returns a report about a public token, so
 * there is no session for a hostile page to ride. The project-wide headers in
 * `next.config.ts` say the API is same-origin, and this path is the stated
 * exception.
 */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
} as const;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ address: string }> },
) {
  const { address } = await ctx.params;

  if (!isAddress(address, { strict: false })) {
    return NextResponse.json(
      { error: "That is not a token address." },
      { status: 400, headers: CORS },
    );
  }

  /**
   * Keyed by address, not only by caller.
   *
   * A report costs a simulation and several upstream reads, and the expensive
   * case is many callers asking about the same token at once rather than one
   * caller walking the chain. Limiting per IP alone would let a board of twenty
   * tokens open twenty budgets.
   */
  const limited = rateLimit(
    clientKey(request, `verify:${address.toLowerCase()}`),
    LIMIT,
    WINDOW_MS,
  );
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  try {
    const report = await verifyToken(address);
    return NextResponse.json(report, {
      headers: {
        ...CORS,
        "cache-control": "public, s-maxage=60, stale-while-revalidate=120",
        "x-ratelimit-limit": String(LIMIT),
        "x-ratelimit-remaining": String(limited.remaining),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Verify could not run. Try again shortly." },
      { status: 502, headers: CORS },
    );
  }
}
