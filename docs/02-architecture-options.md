# Architecture options

Everything here rests on the verified facts in `00-infrastructure-findings.md`.

The product has one hard architectural question and three secondary ones. Get the first one
wrong and the week is gone.

---

## The hard question: where does chain data come from?

Three viable shapes. They differ mostly in how much of the pipeline we own.

### Option A: vendor-first

Bitquery for DEX trades, launchpad events and real-time streams. GeckoTerminal for OHLCV and
token metadata. Blockscout for verification status. Next.js on Vercel. Postgres holds only
user state (follows, watchlists, alert rules) and a cache of computed rankings.

```
Bitquery GraphQL/WS ─┐
GeckoTerminal REST  ─┼─> Next.js route handlers (cache) ─> React
Blockscout REST     ─┘
Postgres (user state + ranking cache)
```

**Scalability.** Read scale is the vendor's problem, which is good, until it is a bill. The
killer is wallet ranking: computing FIFO P&L for a candidate set of wallets means pulling
every swap those wallets made in the window. That is hundreds of thousands of rows per
refresh, twice a day, through a metered GraphQL API.

**Complexity.** Lowest. No reorg logic, no cursors, no backpressure. Maybe 40% less code.

**Speed to first useful screen.** Fastest. Discover and a token page in about two days.

**Maintainability.** High while the vendor behaves. Zero leverage when it does not: a schema
change, a rate-limit change or a pricing change lands directly on the product.

**Cost.** Starts at $49/mo. Scales with *our user count*, which is the wrong variable, because
every page view becomes vendor queries. Wallet ranking alone could dominate the bill.

**Strategic cost.** Our differentiator is wallet intelligence. In this shape, the hard part of
it is rented, and any competitor can rent the same thing tomorrow.

---

### Option B: fully self-hosted index

A long-running worker subscribes to the chain over WebSocket, backfills with `eth_getLogs`,
normalises every swap and transfer, and writes to Postgres. The app reads Postgres and nothing
else.

```
Alchemy WSS + HTTPS ─> indexer worker ─> Postgres ─> Next.js ─> React
                                          │
                                          └─> rollup + ranking jobs
```

**Scalability.** Best read scalability, because everything is a local index scan. Ingest is
the bottleneck and it scales with *chain activity*, not user count, which is the right
variable. But 100ms blocks means 864,000 blocks a day, and at peak the chain has done over
$1.5B daily DEX volume. Indexing every swap on the chain is a real data engineering job.

**Complexity.** Highest. Reorg handling, cursor durability, at-least-once dedupe, USD pricing
for every leg, WebSocket reconnection, backpressure when a burst lands, and a backfill that
does not blow the RPC budget. This is the component that will wake someone up.

**Speed to first useful screen.** Slowest. Four to five days before Discover shows anything
real, which eats the whole week.

**Maintainability.** Ours to fix, which cuts both ways. No vendor can break us; nobody else
can fix us either.

**Cost.** One small VM ($5 to $20/mo), Postgres, and Alchemy compute units. Predictable. The
RPC bill is the variable to watch, and an unbounded full-chain index is exactly how that bill
becomes surprising.

---

### Option C: bounded self-index, vendors at the edges (recommended)

Own the two things that are differentiating and latency-critical. Rent everything else.

Self-hosted, because nothing else can deliver it:
1. **Real-time pool creation stream.** One WebSocket log subscription on Uniswap v4
   `PoolManager.Initialize`, v3 `PoolCreated`, v2 `PairCreated`, plus launchpad factories once
   their addresses are confirmed. Sub-second, and it is the front door of the product.
2. **Swap ingest over a bounded pool universe.** Not the whole chain. The tracked set is
   every pool created in the last 72 hours plus the top N pools by liquidity, with N tuned to
   the measured event rate. Everything the ranking and the tape need lives in that set,
   because that is where meme trading happens.

Rented, because it is commodity and cheap:
- OHLCV candles, token metadata, trending seeds: GeckoTerminal (`robinhood` network slug, free)
- Contract verification and ABI: Blockscout
- Token balances and holder counts: Alchemy data APIs
- Optional accelerator for a deeper historical ranking window: Bitquery

```
Alchemy WSS  ──> indexer worker ──> Postgres ──┬──> Next.js route handlers ──> React
Alchemy HTTPS ─┘   (bounded set)      │        │
                                      │        └──> Supabase Realtime ──────> live feed
GeckoTerminal ─> cache layer ─────────┘
Blockscout ───> risk checks (on demand, cached)
                                      └──> cron: rollups, ranking, alerts
```

**Scalability.** Ingest cost is bounded by a number we choose, not by chain volume or user
count. If the chain doubles, we raise N or we do not. Reads are all local. The ranking window
can be widened later by pointing the same P&L engine at a Bitquery backfill, without changing
a single downstream component.

**Complexity.** Middle, and importantly the complexity is *contained*: one worker, one
well-defined event set, one cursor table. No full-chain reorg-safe archive to maintain.

**Speed to first useful screen.** The live launch feed can be real by end of day one, because
a log subscription plus a table plus a Realtime channel is a small amount of code. Trending
and charts arrive on day two from GeckoTerminal while our own index warms.

**Maintainability.** The rented parts can be swapped without touching the product. The owned
parts are the parts worth owning.

**Cost.** One worker VM, Supabase, Alchemy compute units, and $0 for GeckoTerminal at MVP
volume. Realistically under $50/mo until there is meaningful traffic, with Bitquery as an
optional $49 line item if we want a 30-day ranking window in week two.

---

### Comparison

| | A: vendor-first | B: full self-index | C: bounded hybrid |
|---|---|---|---|
| Scalability | Vendor-capped, cost scales with users | Best, but ingest is a project | Bounded by a tunable, scales on the right axis |
| Complexity | Low | High | Medium, and contained |
| Speed to MVP | 2 days | 4 to 5 days | 1 to 2 days for the headline feature |
| Maintainability | High until a vendor changes | Full control, full burden | Rented parts swappable, owned parts small |
| Monthly cost | $49+, grows with users | $20 to $60, grows with chain | Under $50, grows with a number we set |
| Owns the differentiator | No | Yes | Yes |
| Real-time launch feed | Depends on vendor stream | Yes | Yes |
| Biggest risk | Vendor pricing and rate limits | Week disappears into ingest | Choosing N too small and missing pools |

**Recommendation: C.**

The reasoning is the wallet ranker. It is the only part of this product a competitor cannot
copy in a weekend, and it is exactly the part option A rents out. But building it the option B
way means indexing a 100ms-block chain from scratch before we have a single screen, and that
is not a one-week move. C owns the differentiator over a bounded window, ships the headline
feature on day one, and leaves a clean path to widen the window later without a rewrite.

The one thing C must get right is choosing N. That is settled by measurement, not by opinion:
sample one hour of `eth_getLogs` on mainnet before day one and size the tracked set to the
observed swap rate. That measurement is the first task in the roadmap.

---

## Secondary question 1: swap execution

**A. Uniswap Trading API, proxied server-side.** `POST /v1/quote` then `/v1/swap` returns
calldata for Universal Router 2.1.1. Handles approvals, Permit2 and slippage. Chain 4663 and
UniswapX v3 are supported.

**B. Local routing with the v4 SDK and on-chain Quoter.** No vendor, no key, no rate limit.
But we would be writing a router across v2, v3 and v4 pools, and getting split routes wrong
costs users money.

**C. Our own router contract that takes a fee.** Required only if the Trading API does not
expose interface-fee parameters to third-party keys. Adds a contract to write, test and audit.

**Recommendation: A, with B as the fallback path already stubbed.** The API is free to obtain,
the key stays server-side behind our own rate limiter, and it removes the highest-risk code we
would otherwise write in week one. C is deferred until the fee question is answered, and it is
a business-model question, not a product one.

Non-negotiable regardless of choice: we validate returned calldata before it reaches the
wallet. Router address must match a pinned allowlist, the recipient must equal the connected
address, and token addresses and amounts must match what the user was shown. This is cheap
and it is the difference between proxying an API and trusting one.

## Secondary question 2: where the indexer runs

Vercel functions now support WebSockets and run to 300 seconds, but an indexer wants
indefinite uptime and a durable cursor, not a 5-minute ceiling and a cold start.

**Recommendation: a single always-on worker on Railway or Fly, separate from the Vercel app.**
The app stays serverless and stateless. The worker is the only stateful thing we run, it does
one job, and it can be restarted without touching the product.

## Secondary question 3: realtime transport to the browser

**Supabase Realtime** on Postgres changes. The indexer writes a row, every connected browser
gets it. No SSE endpoint to build, no connection pool to manage on Vercel, no second transport
to debug. Recommended.

The alternative, SSE from our own worker, means the worker now serves public traffic and needs
its own scaling and rate limiting. Not worth it for v1.

## Secondary question 4: token creation

pools.trade contracts are live but their address and ABI are not published anywhere I could
verify, so integrating with them is not something to commit a week to.

**Recommendation for v1:** our own minimal fixed-template ERC-20 deployed through a CREATE2
factory, then a Uniswap v4 pool initialised and seeded through PositionManager, both signed by
the user. Two small contracts, one audit surface, fully understood. If pools.trade publishes
an ABI we can add it as a second launch mode later, and the confirmation screen already has
the shape for it.

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js App Router, TypeScript strict | Server-side fetching, route handlers as the API, no separate backend |
| Styling | Tailwind, custom tokens, no component library | The look is the product. A UI kit fights us. |
| Charts | `lightweight-charts` (TradingView) | Real candles, ~45KB, built for this exact job. Recharts is a dashboard library and would look like one. |
| Wallet | wagmi + viem, Reown AppKit connector | Standard EIP-1193, no custom signing paths |
| Data | Supabase Postgres + Realtime | One dependency covers database, realtime and row-level security |
| Indexer | Node + viem, single worker, Railway or Fly | Always-on, one job |
| Jobs | Vercel Cron calling protected route handlers | Rollups, ranking, alerts, narrative refresh |
| Rate limiting | Upstash Redis | Needed for the public API proxies regardless |

New dependencies total: charts, wallet, and the Supabase client. Everything else is already in
the Next.js and Vercel surface.
