import { rateLimit, clientKey, tooManyRequests } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { scoreWallets } from "@/lib/wallets/pnl";

/** Scored wallets. Heavy, so it is limited and cached hard upstream. */
export async function GET(request: Request) {
  const limited = rateLimit(clientKey(request, "scores"), 20, 60_000);
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const scores = await scoreWallets();
  return NextResponse.json(scores.slice(0, 100));
}
