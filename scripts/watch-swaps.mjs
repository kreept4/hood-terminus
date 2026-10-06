/**
 * Watches every Uniswap V2-style Swap event on Robinhood Chain, live, and
 * writes raw rows to Supabase.
 *
 * Subscribes by event signature only, no address filter — this catches
 * swaps on every V2 pool chain-wide from one WebSocket subscription,
 * without needing to know pool addresses in advance. eth_subscribe has no
 * block-range limit (that 10-block cap is specific to eth_getLogs on the
 * free tier, measured in docs/11-measured-constraints.md), so this is the
 * right primitive for live tracking.
 *
 * V2 only for now. V3/V4 use a different Swap event shape (signed deltas
 * instead of separate in/out amounts) — worth adding once this pipeline is
 * proven, not before.
 *
 * Run this continuously, in its own terminal, separate from `npm run dev`:
 *   node scripts/watch-swaps.mjs
 *
 * Ctrl+C to stop. It flushes its buffer before exiting.
 */

import { readFileSync } from "node:fs";
import { createPublicClient, webSocket } from "viem";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const ALCHEMY_WSS_URL = env.ALCHEMY_WSS_URL;
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

for (const [name, value] of Object.entries({
  ALCHEMY_WSS_URL,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
})) {
  if (!value) {
    console.error(`[worker] missing ${name} in .env.local`);
    process.exit(1);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Standard Uniswap V2 pair Swap event. Same shape on every V2-style pool
// regardless of address, which is what makes the no-address-filter
// subscription work.
const SWAP_EVENT = {
  type: "event",
  name: "Swap",
  inputs: [
    { indexed: true, name: "sender", type: "address" },
    { indexed: false, name: "amount0In", type: "uint256" },
    { indexed: false, name: "amount1In", type: "uint256" },
    { indexed: false, name: "amount0Out", type: "uint256" },
    { indexed: false, name: "amount1Out", type: "uint256" },
    { indexed: true, name: "to", type: "address" },
  ],
};

const client = createPublicClient({
  transport: webSocket(ALCHEMY_WSS_URL, {
    reconnect: { attempts: Infinity, delay: 2000 },
    keepAlive: { interval: 15000 },
  }),
});

let buffer = [];
let flushing = false;
let received = 0;
let written = 0;

async function flush() {
  if (flushing || buffer.length === 0) return;
  flushing = true;
  const batch = buffer.splice(0, buffer.length);
  const { error } = await supabase.from("swaps").upsert(batch, {
    onConflict: "tx_hash,log_index",
    ignoreDuplicates: true,
  });
  if (error) {
    console.error(`[worker] insert error, ${batch.length} rows dropped:`, error.message);
  } else {
    written += batch.length;
    console.log(`[worker] flushed ${batch.length} (total received ${received}, written ${written})`);
  }
  flushing = false;
}

const flushTimer = setInterval(flush, 4000);

console.log("[worker] connecting to Robinhood Chain mainnet WSS...");

const unwatch = client.watchEvent({
  event: SWAP_EVENT,
  onLogs: (logs) => {
    for (const log of logs) {
      received++;
      try {
        buffer.push({
          block_number: Number(log.blockNumber),
          tx_hash: log.transactionHash,
          log_index: log.logIndex,
          pool_address: log.address.toLowerCase(),
          wallet_address: log.args.to.toLowerCase(),
          sender_address: log.args.sender.toLowerCase(),
          amount0_in: log.args.amount0In.toString(),
          amount1_in: log.args.amount1In.toString(),
          amount0_out: log.args.amount0Out.toString(),
          amount1_out: log.args.amount1Out.toString(),
        });
      } catch (e) {
        console.error("[worker] decode error:", e.message);
      }
    }
  },
  onError: (err) => {
    console.error("[worker] subscription error:", err.message);
  },
});

console.log("[worker] subscribed. Watching for swaps...");

async function shutdown() {
  console.log("\n[worker] shutting down, flushing buffer...");
  clearInterval(flushTimer);
  unwatch();
  await flush();
  console.log(`[worker] done. Total received ${received}, written ${written}.`);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
