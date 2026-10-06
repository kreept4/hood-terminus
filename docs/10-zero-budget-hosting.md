# Shipping this on $0

Constraint added 2026-09-03: there is no budget. Not "a small budget", zero.

This is an architecture change, not a footnote. Two things in the earlier plan
quietly assumed money, and both are now solved differently.

## The two things that broke

**1. Vercel Cron cannot run our jobs.** On the Hobby plan a cron job runs
**once per day**, timing guaranteed only to the hour, UTC only. Any expression
that would fire more than once a day is rejected at deploy time. The rollup job
needs to run every 60 seconds and the ranker every 12 hours, so Vercel Cron is
out entirely until there is $20/mo for Pro.

**2. Supabase free is 500MB of database.** Raw swaps on a 100ms-block chain will
eat that in days. The earlier plan assumed we could keep 30 days of them.

## The $0 stack

| Layer | Service | Free allowance | What it holds |
|---|---|---|---|
| App | Vercel Hobby | Free | Next.js, route handlers, static |
| Indexer + scheduler | Oracle Cloud Always Free | 4 ARM cores, 24GB RAM, 200GB block storage, 10TB egress, indefinitely | The worker, all scheduled jobs, and the raw event log |
| App database | Supabase Free | 500MB DB, 5GB egress, 200 concurrent realtime connections, 2M realtime messages/mo | Derived and user-facing data only |
| RPC + WebSocket | Alchemy Free | Generous monthly compute units, WSS included | Chain reads and the live subscription |
| Market data | GeckoTerminal | Free, no key | Candles and metadata while our index warms |
| Swap routing | Uniswap Trading API | Free self-serve key | Quotes and calldata |
| Domain | `*.vercel.app` | Free | Until a domain is worth $10/yr |

**Total: $0/month, indefinitely.**

Oracle's Always Free tier is the load-bearing piece. Four ARM cores and 24GB of
RAM, free with no expiry, is more compute than this product needs for a long
time. It requires a card for identity verification and does not charge it.

## The three changes that follow

### 1. Scheduled jobs move off Vercel and onto the worker

The worker already has to be an always-on process. It now also owns the
schedule, with `node-cron` in the same process:

```
worker/
  index.ts        subscription manager + scheduler
  streams/        live log subscriptions
  jobs/
    rollups.ts    every 60s
    risk.ts       every 5m
    alerts.ts     every 60s
    rank.ts       every 12h
    prune.ts      daily
```

This is simpler than the original design, not more complex. One process, one
deployment, one place to look when a job stops. The `/api/cron/*` route handlers
stay in the codebase as manually triggerable endpoints behind the shared secret,
which is useful for debugging and means moving back to Vercel Cron later is a
config change.

### 2. The database splits in two, along a line that was already there

The three table groups in `03-data-model.md` already had different write paths.
Now they get different homes.

**Local Postgres on the Oracle box** holds the raw event log: `swaps`,
`liquidity_events`, `indexer_cursors`. The browser never reads these directly.
They exist to be folded into derived state. 200GB of block storage means
retention is a choice rather than a constraint.

**Supabase** holds everything the app actually reads: `tokens`, `pools`,
`token_launches`, `candles`, `token_stats`, `token_risk`, `positions`,
`wallet_metrics`, `wallet_rankings`, and all user state. This is derived and
small. It also keeps Realtime, anonymous auth and RLS, which are the three
things Supabase gives us that a bare Postgres does not.

The worker is the only thing that talks to both. Nothing else needs to know
there are two databases.

**Why this is better, not just cheaper.** The read path is now physically
incapable of running an aggregate over the swap log, because the swap log is not
in the database the app connects to. The most important performance rule in the
schema is now enforced by topology instead of by discipline.

### 3. Realtime messages become a budget

2 million realtime messages a month sounds like a lot until you multiply by
connected clients. At the chain's July peak of ~18,600 launches a day, an
unfiltered feed broadcast to 10 concurrent viewers would be about 5.6M messages
a month. Over budget on its own.

So filtering moves server-side. The worker only publishes a launch to Realtime
if it clears a baseline threshold (initial liquidity above a floor, and a
completed sell simulation). Everything else is written to the table and reaches
the client on a normal paginated fetch when they widen their filters.

This is the right product decision independently. An unfiltered launch feed on
this chain is mostly noise, and the PRD already turns filters on by default.
The free tier just forces us to do the filtering in the place it belongs.

## What $0 costs us

Stated plainly, so nothing is discovered later:

- **Vercel Hobby is non-commercial under their terms.** The moment the platform
  charges a launch fee, the app needs Pro at $20/mo. That is the first bill and
  it arrives with the first revenue, which is the correct order.
- **No paid backfill.** The 30-day ranking window is off the table. 7 days from
  our own index, per decision D1, which is what we chose anyway.
- **Supabase free pauses after 7 days of inactivity.** Not a risk while the
  worker is writing continuously, but it means the project must not be left
  idle before launch.
- **One point of failure.** Everything stateful sits on one Oracle instance. A
  free tier does not come with redundancy. The mitigation is that the app
  degrades rather than dies: if the worker stops, the site still reads from
  Supabase and shows stale markers, which is the correct failure mode.
- **Alchemy compute units are the real ceiling.** The free tier is generous but
  finite, and an unbounded backfill would burn it. The budget guard in
  `06-threat-and-failure-analysis.md` moves from "good practice" to "the thing
  standing between us and a dead RPC key".

## What this does not change

The architecture choice itself. Option C, the bounded hybrid, was recommended
because it owns the differentiator on a cost that scales with a number we set
rather than with users. On a zero budget that reasoning gets stronger, not
weaker: option A would have cost $49/mo we do not have.
