import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem, getAddress } from "viem";
import { createClient } from "@supabase/supabase-js";
import { robinhoodChain } from "@/lib/chain";

/**
 * Keeps the pool index current, on a schedule.
 *
 * The backfill is a script somebody runs. This is the same work, incremental,
 * so the index does not quietly become a snapshot of the day it was built. The
 * chain creates roughly 550 pools a day, so an index left alone for a week is
 * describing a market four thousand pools out of date while presenting itself
 * as complete, which is worse than being obviously stale.
 *
 * Resumes from the cursor and only advances it after a window is written, so a
 * run that is cut short repeats a window rather than skipping one. Overlapping
 * runs are harmless: writes are upserts keyed by pool address.
 *
 * Deliberately narrow in what it does per invocation. A cron has a time budget,
 * and a route that tries to catch up six million blocks in one go will be
 * killed halfway. Falling behind by a few windows and catching up over a few
 * runs is the correct failure mode.
 */

export const maxDuration = 60;

const FACTORY = getAddress("0x1f7d7550b1b028f7571e69a784071f0205fd2efa");
const WINDOW = 500_000n;

/**
 * Enough for a day, with headroom, inside the function's time budget.
 *
 * This chain does roughly 807,000 blocks a day at 107ms each, so a daily run
 * has under two windows to catch up on. Four leaves room for a missed run
 * without the index falling behind, and stops a cold start trying to swallow
 * six million blocks and being killed halfway.
 *
 * Daily rather than hourly because Vercel's Hobby plan allows one cron run a
 * day. That is a real limitation and it shows: a pool launched at 09:00 is not
 * searchable here until the next morning. The endpoint is safe to call by hand
 * or from any external scheduler in the meantime, and going to Pro is what buys
 * hourly.
 */
const MAX_WINDOWS_PER_RUN = 4;

const POOL_CREATED = parseAbiItem(
  "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)",
);

const ERC20 = [
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

export async function GET(request: Request) {
  /**
   * Vercel signs its own cron calls with this header. The secret check is what
   * stops anyone else triggering a job that makes hundreds of RPC calls.
   */
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const rpc = process.env.ALCHEMY_HTTPS_URL ?? robinhoodChain.rpcUrls.default.http[0];
  if (!url || !key) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const client = createPublicClient({ chain: robinhoodChain, transport: http(rpc) });

  const head = await client.getBlockNumber();

  const { data: cursor } = await db
    .from("index_cursor")
    .select("block_number")
    .eq("name", "pools")
    .maybeSingle();

  // With no cursor there is nothing to catch up to incrementally. The backfill
  // script owns that case; this one only follows.
  if (!cursor) {
    return NextResponse.json({ error: "No cursor. Run the backfill first." }, { status: 409 });
  }

  let from = BigInt(cursor.block_number) + 1n;
  if (from > head) return NextResponse.json({ found: 0, upTo: Number(head) });

  let found = 0;
  let windows = 0;

  while (from <= head && windows < MAX_WINDOWS_PER_RUN) {
    const to = from + WINDOW - 1n > head ? head : from + WINDOW - 1n;

    const logs = await client.getLogs({
      address: FACTORY,
      event: POOL_CREATED,
      fromBlock: from,
      toBlock: to,
    });

    if (logs.length > 0) {
      const tokens = [...new Set(logs.flatMap((l) => [l.args.token0!, l.args.token1!]))];
      const meta = new Map<string, { symbol: string | null; decimals: number | null }>();

      for (let i = 0; i < tokens.length; i += 100) {
        const slice = tokens.slice(i, i + 100);
        const results = await client.multicall({
          contracts: slice.flatMap((address) => [
            { address, abi: ERC20, functionName: "symbol" as const },
            { address, abi: ERC20, functionName: "decimals" as const },
          ]),
          allowFailure: true,
        });
        slice.forEach((address, n) => {
          const symbol = results[n * 2];
          const decimals = results[n * 2 + 1];
          meta.set(address.toLowerCase(), {
            symbol: symbol?.status === "success" ? String(symbol.result) : null,
            decimals: decimals?.status === "success" ? Number(decimals.result) : null,
          });
        });
      }

      await db.from("pools").upsert(
        logs.map((l) => {
          const blank = { symbol: null, decimals: null };
          const t0 = meta.get(l.args.token0!.toLowerCase()) ?? blank;
          const t1 = meta.get(l.args.token1!.toLowerCase()) ?? blank;
          return {
            address: l.args.pool!.toLowerCase(),
            token0: l.args.token0!.toLowerCase(),
            token1: l.args.token1!.toLowerCase(),
            fee: Number(l.args.fee),
            created_block: Number(l.blockNumber),
            token0_symbol: t0.symbol ?? null,
            token1_symbol: t1.symbol ?? null,
            token0_decimals: t0.decimals ?? null,
            token1_decimals: t1.decimals ?? null,
          };
        }),
        { onConflict: "address" },
      );
      found += logs.length;
    }

    await db.from("index_cursor").upsert({
      name: "pools",
      block_number: Number(to),
      updated_at: new Date().toISOString(),
    });

    from = to + 1n;
    windows++;
  }

  const { count } = await db.from("pools").select("address", { count: "exact", head: true });

  return NextResponse.json({
    found,
    windows,
    upTo: Number(from - 1n),
    caughtUp: from > head,
    total: count ?? null,
  });
}
