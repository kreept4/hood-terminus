# What the chain and the free tier actually do

Measured 2026-09-03 against mainnet, `scripts/measure-chain.mjs`. Two of these
change the plan.

## Chain volume

| | Measured |
|---|---|
| Block time | **107ms** |
| Logs per block | **189** |
| Logs per day | **~153,000,000** |
| Sustained rate | **1,772 logs/sec** |
| Unique contracts emitting, in 32 seconds | **1,195** |

Sampled over 300 blocks at head 53,620,151.

## The event mix

Discovered by counting `topic0`, not by assuming hashes.

| topic0 | Share | What it is |
|---|---|---|
| `0xddf252ad…` | 43.5% | ERC-20 `Transfer` |
| `0x37e7f0db…` | 9.2% | **Unidentified, and the second busiest thing on the chain.** Worth decoding before the indexer subscribes to anything. |
| `0x8c5be1e5…` | 6.4% | ERC-20 `Approval` |
| `0x40e9cecb…` | 5.5% | Uniswap **v4** `Swap` |
| `0xc42079f9…` | 4.3% | Uniswap **v3** `Swap` |
| `0x93485dcd…` | 4.3% | Unidentified |
| `0xc532c43b…` | 2.7% | Unidentified |

Uniswap v3 and v4 swaps together are **9.8%** of chain logs, roughly **174/sec**.
That is the real trading signal, and it is a tenth of the firehose.

## Constraint 1: no historical backfill on this plan

> `eth_getLogs`: Under the Free tier plan, you can make eth_getLogs requests
> with up to a 10 block range.

Ten blocks is **one second** of this chain. A 7-day backfill would be 5.76M
blocks, so 576,000 `eth_getLogs` calls. That is not a rate-limit annoyance, it
is a wall.

**Consequence: the indexer is forward-only.** It starts from the block it is
switched on at and accumulates. There is no way to reach backwards without
paying, and `eth_subscribe` has no equivalent range cap, so live ingest is
unaffected.

**Consequence for the wallet ranker:** the window is not a setting we choose on
day one, it is however long the indexer has been running. 24 hours after
launch we have a 24-hour window. Seven days after launch we have the 7-day
window from decision D1. That is the fallback we already planned for, arrived
at by a different route, and the schema already carries the window as a column
so nothing downstream changes.

It also means **the indexer should be switched on before the product is
finished**, not after. Every day it is not running is a day of history we can
never recover.

## Constraint 2: taking everything is not an option

153M logs/day at 189 per block. Even storing 10% of that is 15M rows a day,
which no free-tier database survives and which the Oracle box would not enjoy
either.

This retires any lingering version of the "just index the chain" plan. The
bounded universe from `02-architecture-options.md` is now mandatory rather than
merely preferable:

1. Subscribe with a **topic filter** on the v3 and v4 `Swap` signatures and the
   pool-creation signatures. That alone drops 90% of the firehose.
2. Filter again by **pool address**, to the tracked set: pools created in the
   last 72 hours plus the top N by liquidity.
3. Fold swaps into `positions` continuously and keep raw swaps for **72 hours**,
   not 30 days. Positions persist; raw events do not.

## Still to do before the indexer subscribes to anything

- **Decode `0x37e7f0db…`.** 9.2% of all chain logs from an unidentified
  signature is either a launchpad, a stock-token mechanism, or something we
  should be indexing on purpose. Second busiest event on the chain is not
  something to leave unnamed.
- Confirm the v4 `PoolManager` address and the `Initialize` topic from the
  busiest-contracts list rather than from documentation.
- Identify `0x5fc5360d…`, which emitted 7,805 logs in 32 seconds and is the
  single busiest contract on the chain.

## What this does not change

The architecture. Option C was chosen because ingest cost is bounded by a
number we set rather than by chain volume. At 1,772 logs/sec that reasoning is
no longer a preference, it is the only thing that makes the product possible on
this budget.
