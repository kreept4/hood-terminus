import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/**
 * Recent trades by the wallets someone is tracking.
 *
 * Tracked wallets live in the browser, not in a table, because there is no
 * sign-in to attach them to. So the client sends the list and this answers for
 * exactly those addresses. Nothing is stored, and asking about a wallet gives
 * nothing away: every one of these trades is already public on chain.
 *
 * Capped on both ends. An unbounded address list turns one request into a full
 * table scan, and an unbounded result returns more rows than anyone reads.
 */

const MAX_WALLETS = 40;
const MAX_ROWS = 40;

export async function POST(request: Request) {
  const limited = rateLimit(clientKey(request, "wallet-activity"), 60, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ trades: [] });

  let wallets: string[];
  try {
    const body = (await request.json()) as { wallets?: unknown };
    wallets = Array.isArray(body.wallets)
      ? body.wallets
          .filter((w): w is string => typeof w === "string")
          .filter((w) => /^0x[0-9a-fA-F]{40}$/.test(w))
          .map((w) => w.toLowerCase())
          .slice(0, MAX_WALLETS)
      : [];
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  if (wallets.length === 0) return NextResponse.json({ trades: [] });

  try {
    const db = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await db
      .from("swaps")
      .select(
        "pool_address,wallet_address,amount0_in,amount1_in,amount0_out,amount1_out,created_at",
      )
      .in("wallet_address", wallets)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);

    if (error) return NextResponse.json({ trades: [] });
    return NextResponse.json({ trades: data ?? [] });
  } catch {
    return NextResponse.json({ trades: [] });
  }
}
