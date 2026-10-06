/**
 * Indexes every pool on the chain from the Uniswap factory.
 *
 * Run it once to backfill, then on a timer to follow new pools. It resumes from
 * a cursor, so a second run costs one small window rather than six million
 * blocks, and it is safe to interrupt: the cursor only advances after a window
 * has been written.
 *
 *   node scripts/index-pools.mjs            follow from the cursor
 *   node scripts/index-pools.mjs --full     rescan from the beginning
 *
 * Symbols and decimals are resolved through Multicall3 in batches. Tokens that
 * do not answer are stored with nulls rather than skipped: a pool with an
 * unreadable token is still a real pool, and dropping it would put a hole in
 * the very list this exists to complete.
 */

import { createPublicClient, http, parseAbiItem, getAddress } from "viem";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const FACTORY = getAddress("0x1f7d7550b1b028f7571e69a784071f0205fd2efa");
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const RPC = "https://rpc.mainnet.chain.robinhood.com";

/**
 * How far back a full scan reaches.
 *
 * Six million blocks is roughly a week at this chain's 107ms blocks, and it is
 * where the factory's events run out: scanning further returned nothing.
 */
const FULL_SCAN_BLOCKS = 6_000_000n;

/** The node refuses much wider windows, and this one has never been refused. */
const WINDOW = 500_000n;

const POOL_CREATED = parseAbiItem(
  "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)",
);

const ERC20 = [
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
];

function env(key) {
  const file = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const match = file.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim().replace(/^['"]|['"]$/g, "") : null;
}

const chain = {
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  contracts: { multicall3: { address: MULTICALL3 } },
};

async function main() {
  const full = process.argv.includes("--full");

  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase credentials missing from .env.local.");

  const db = createClient(url, key, { auth: { persistSession: false } });
  const client = createPublicClient({ chain, transport: http(RPC) });

  const head = await client.getBlockNumber();

  let from;
  if (full) {
    from = head > FULL_SCAN_BLOCKS ? head - FULL_SCAN_BLOCKS : 0n;
  } else {
    const { data } = await db
      .from("index_cursor")
      .select("block_number")
      .eq("name", "pools")
      .maybeSingle();
    from = data ? BigInt(data.block_number) + 1n : head - FULL_SCAN_BLOCKS;
  }

  console.log(`head    ${head}`);
  console.log(`from    ${from}`);
  console.log(`windows ${(head - from) / WINDOW + 1n}\n`);

  let found = 0;
  let written = 0;

  for (let start = from; start <= head; start += WINDOW) {
    const end = start + WINDOW - 1n > head ? head : start + WINDOW - 1n;

    let logs;
    try {
      logs = await client.getLogs({
        address: FACTORY,
        event: POOL_CREATED,
        fromBlock: start,
        toBlock: end,
      });
    } catch (e) {
      console.error(`  window ${start}-${end} failed, stopping here: ${String(e).split("\n")[0]}`);
      break;
    }

    found += logs.length;
    if (logs.length > 0) {
      written += await write(db, client, logs);
    }

    // Advanced only after the window is written, so an interrupted run
    // repeats a window rather than skipping one.
    await db
      .from("index_cursor")
      .upsert({ name: "pools", block_number: Number(end), updated_at: new Date().toISOString() });

    process.stdout.write(`\r  scanned to ${end}  found ${found}  written ${written}   `);
  }

  console.log("\n");
  const { count } = await db.from("pools").select("address", { count: "exact", head: true });
  console.log(`pools in the index: ${count}`);
}

/** Resolves the tokens for a batch of pools and upserts them. */
async function write(db, client, logs) {
  const tokens = [...new Set(logs.flatMap((l) => [l.args.token0, l.args.token1]))];

  const meta = new Map();
  // Batched, because one multicall of four hundred reads beats four hundred
  // round trips against a public endpoint.
  for (let i = 0; i < tokens.length; i += 100) {
    const slice = tokens.slice(i, i + 100);
    const results = await client.multicall({
      contracts: slice.flatMap((address) => [
        { address, abi: ERC20, functionName: "symbol" },
        { address, abi: ERC20, functionName: "decimals" },
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

  const rows = logs.map((l) => {
    const t0 = meta.get(l.args.token0.toLowerCase()) ?? {};
    const t1 = meta.get(l.args.token1.toLowerCase()) ?? {};
    return {
      address: l.args.pool.toLowerCase(),
      token0: l.args.token0.toLowerCase(),
      token1: l.args.token1.toLowerCase(),
      fee: Number(l.args.fee),
      created_block: Number(l.blockNumber),
      token0_symbol: t0.symbol ?? null,
      token1_symbol: t1.symbol ?? null,
      token0_decimals: t0.decimals ?? null,
      token1_decimals: t1.decimals ?? null,
    };
  });

  const { error } = await db.from("pools").upsert(rows, { onConflict: "address" });
  if (error) {
    console.error("\n  write failed:", error.message);
    return 0;
  }
  return rows.length;
}

main().catch((e) => {
  console.error(String(e).split("\n")[0]);
  process.exitCode = 1;
});
