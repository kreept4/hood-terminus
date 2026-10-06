import { rateLimit, clientKey, tooManyRequests } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { getPortfolio } from "@/lib/portfolio/holdings";

/**
 * Holdings for one wallet.
 *
 * A route rather than a server component because the address only exists in the
 * browser: it comes from the connected wallet, and the server has no way to
 * know it at render time.
 *
 * The address is validated here before it reaches an RPC call. It is
 * interpolated into calldata, and an unchecked value there is a hole.
 */
export async function GET(request: Request) {
  const limited = rateLimit(clientKey(request, "portfolio"), 20, 60000);
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const portfolio = await getPortfolio(address);
  return NextResponse.json(portfolio, {
    headers: { "cache-control": "no-store" },
  });
}
