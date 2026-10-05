import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { verifyToken } from "@/lib/verify";

/**
 * GET /api/verify/:address
 *
 * Runs Verify for one token and returns the report. Takes an address from
 * anyone and fans out to a simulation plus a handful of RPC and GeckoTerminal
 * reads, so responses are cached at the edge for a minute on top of the
 * in-process cache in lib/verify.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  if (!isAddress(address, { strict: false })) {
    return NextResponse.json({ error: "That is not a token address." }, { status: 400 });
  }

  try {
    const report = await verifyToken(address);
    return NextResponse.json(report, {
      headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch {
    return NextResponse.json({ error: "Verify could not run. Try again shortly." }, { status: 502 });
  }
}
