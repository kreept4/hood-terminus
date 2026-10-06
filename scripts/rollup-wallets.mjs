/**
 * Recomputes wallet_rankings from raw swaps, on a timer.
 *
 * Calls the refresh_wallet_rankings() Postgres function (defined in
 * supabase/migrations/0002_wallet_activity.sql), which does the aggregation
 * server-side rather than pulling every swap row into Node. That matters
 * once swaps has real volume — this stays a single fast query regardless
 * of table size, rather than growing with it.
 *
 * Run this continuously, in its own terminal, alongside watch-swaps.mjs
 * and npm run dev:
 *   node scripts/rollup-wallets.mjs
 *
 * Ctrl+C to stop.
 */

import { readFileSync } from "node:fs";
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
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[rollup] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const INTERVAL_MS = 60_000;

async function tick() {
  const { error } = await supabase.rpc("refresh_wallet_rankings");
  if (error) {
    console.error("[rollup] error:", error.message);
  } else {
    console.log(`[rollup] refreshed at ${new Date().toISOString()}`);
  }
}

console.log(`[rollup] starting, refreshing every ${INTERVAL_MS / 1000}s...`);
tick();
const timer = setInterval(tick, INTERVAL_MS);

process.on("SIGINT", () => {
  clearInterval(timer);
  console.log("\n[rollup] stopped.");
  process.exit(0);
});
