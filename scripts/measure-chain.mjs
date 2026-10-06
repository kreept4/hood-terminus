/**
 * Day-zero measurement.
 *
 * The whole architecture rests on one number nobody can look up: how many
 * events this chain actually produces. That decides the size of the tracked
 * pool universe, the RPC budget, and whether a 7-day ranking window is
 * affordable. Guessing it is how the week gets lost.
 *
 * This samples a real block range and reports what is there. It does not
 * assume any topic hashes: it counts every log by topic0 and ranks them, so
 * the busiest event signatures on the chain are discovered rather than
 * asserted. Whatever comes back is what the indexer will subscribe to.
 *
 * Run:  node scripts/measure-chain.mjs [blocks]
 */

import { readFileSync } from "node:fs";

function loadEnv() {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const env = {};
  // Split on both endings. `.` never matches \r in JS, so on a CRLF file the
  // value regex fails on every line while the file looks perfectly fine.
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const { ALCHEMY_HTTPS_URL } = loadEnv();
if (!ALCHEMY_HTTPS_URL) {
  console.error("ALCHEMY_HTTPS_URL missing from .env.local");
  process.exit(1);
}

let rpcCalls = 0;

async function rpc(method, params = []) {
  rpcCalls++;
  const res = await fetch(ALCHEMY_HTTPS_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: rpcCalls, jsonrpc: "2.0", method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

const hex = (n) => "0x" + n.toString(16);

async function main() {
  const sampleBlocks = Number(process.argv[2] ?? 400);

  const head = parseInt(await rpc("eth_blockNumber"), 16);
  const from = head - sampleBlocks;

  // Two blocks far enough apart to measure real spacing rather than jitter.
  const [a, b] = await Promise.all([
    rpc("eth_getBlockByNumber", [hex(from), false]),
    rpc("eth_getBlockByNumber", [hex(head), false]),
  ]);
  const spanSec = parseInt(b.timestamp, 16) - parseInt(a.timestamp, 16);
  const blockMs = (spanSec * 1000) / sampleBlocks;

  console.log(`\n  head block      ${head.toLocaleString()}`);
  console.log(`  sampled         ${sampleBlocks} blocks (${spanSec}s)`);
  console.log(`  block time      ${blockMs.toFixed(0)}ms`);

  // Chunked, because a provider caps how many logs one response may carry and
  // a silent truncation would make every number below a lie.
  // Free tier caps eth_getLogs at a 10-block range. This is the hard limit
  // that makes historical backfill impossible on this plan, and it is why the
  // indexer is forward-only. See docs/11-measured-constraints.md.
  const CHUNK = 10;
  const byTopic = new Map();
  const byAddress = new Map();
  let total = 0;
  let truncated = false;

  for (let start = from; start < head; start += CHUNK) {
    const end = Math.min(start + CHUNK - 1, head);
    let logs;
    try {
      logs = await rpc("eth_getLogs", [
        { fromBlock: hex(start), toBlock: hex(end) },
      ]);
    } catch (err) {
      // A range that exceeds the response cap is itself a finding.
      console.log(`  ! chunk ${start}-${end}: ${err.message}`);
      truncated = true;
      continue;
    }
    total += logs.length;
    for (const log of logs) {
      const t0 = log.topics?.[0];
      if (t0) byTopic.set(t0, (byTopic.get(t0) ?? 0) + 1);
      byAddress.set(log.address, (byAddress.get(log.address) ?? 0) + 1);
    }
  }

  const perBlock = total / sampleBlocks;
  const perDay = perBlock * (86_400_000 / blockMs);

  console.log(`\n  logs in sample  ${total.toLocaleString()}`);
  console.log(`  per block       ${perBlock.toFixed(1)}`);
  console.log(`  projected/day   ${Math.round(perDay).toLocaleString()}`);
  console.log(`  unique contracts ${byAddress.size.toLocaleString()}`);
  if (truncated) console.log(`  NOTE: some chunks failed, totals are a floor`);

  console.log(`\n  busiest event signatures (topic0)`);
  console.log("  " + "-".repeat(74));
  const topics = [...byTopic.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12);
  for (const [t, n] of topics) {
    const share = ((n / total) * 100).toFixed(1);
    console.log(`  ${t}  ${String(n).padStart(6)}  ${share.padStart(5)}%`);
  }

  console.log(`\n  busiest contracts`);
  console.log("  " + "-".repeat(74));
  const addrs = [...byAddress.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, 10);
  for (const [addr, n] of addrs) {
    console.log(`  ${addr}  ${String(n).padStart(6)}`);
  }

  // What this costs us to keep up with, in the only unit that matters here.
  const logsPerSec = perBlock / (blockMs / 1000);
  console.log(`\n  sustained ingest ${logsPerSec.toFixed(1)} logs/sec if we took everything`);
  console.log(`  rpc calls used   ${rpcCalls}\n`);
}

main().catch((err) => {
  console.error("\n  failed:", err.message, "\n");
  process.exit(1);
});
