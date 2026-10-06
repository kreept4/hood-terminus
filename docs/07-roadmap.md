# Seven-day MVP roadmap

Each day ends with something visible in the browser. Nothing is "done" until it has loading,
empty and error states and works on a phone.

## Day 0: prerequisites, about two hours

These block day one and none of them are engineering.

- Alchemy account, Robinhood Chain mainnet app, HTTPS and WSS keys
- Uniswap API key from developers.uniswap.org/dashboard
- Supabase project, Postgres 15, `pg_trgm` enabled
- Railway or Fly project for the worker
- Vercel project linked

Then the one measurement that sizes the whole architecture:

**Sample one hour of mainnet logs.** Count `Swap` events per minute across the chain, and
count pool creations per minute. This decides the tracked-pool universe size N, and therefore
the RPC budget and the ranking window. Guessing here is how the week gets lost.

## Day 1: skeleton, chain, live feed

- Next.js App Router, TypeScript strict, Tailwind with the design tokens from the PRD
- `lib/chain`: chain 4663 definition, viem public client, address codec, ABIs
- Design primitives: `Value`, `Delta`, `Stat`, `Table`, `Address`, `Chip`, `Empty`, `Skeleton`
- App shell: five-tab navigation, top on desktop, bottom on mobile
- Supabase migration: full schema from `03-data-model.md`
- Worker: WebSocket subscription on v4 `Initialize`, v3 `PoolCreated`, v2 `PairCreated`, with
  durable cursor and the liveness watchdog
- `token_launches` publishing over Supabase Realtime
- Discover renders the live feed

**End of day 1: tokens appear on screen as they are created on chain.** That is the product's
whole thesis proven on day one, and everything after it is addition rather than risk.

## Day 2: Discover complete, token page shell

- Launch filters with URL and localStorage persistence, pause on hover
- `token_stats` rollup job, trending and movers
- Search with trigram matching and address short-circuit
- Watchlist with anonymous Supabase auth
- Token page header, routed from every list
- Candles endpoint reading `candles`, backfilled from GeckoTerminal for young pools

## Day 3: charts, verification

- `lightweight-charts` integration, six timeframes, volume, crosshair
- Live price updates over the token Realtime channel patching the last candle
- Swap ingest for the tracked universe, so the trade tape is ours rather than borrowed
- Risk panel: Blockscout verification, mint and owner checks, holder concentration,
  sell simulation via `eth_call`, tax measurement
- Trades, Holders and Liquidity tabs

**End of day 3: the DISCOVER and VERIFY halves of the loop are complete and honest.**

## Day 4: wallet connection and trading

- wagmi and Reown AppKit, chain guard, connect only at the point of signing
- Trade panel: side toggle, amount, quote, impact, minimum received, slippage, route, fees
- Server proxies for quote, approval and swap, with the calldata validation gate and tests
  that feed it deliberately malformed responses
- Transaction state machine and `user_transactions` persistence
- Rate limiting on all proxy routes
- End-to-end test on testnet 46630, then one small real trade on mainnet

**End of day 4: a stranger can land, find a token, connect and buy.** This is the point at
which the product is worth showing anyone.

## Day 5: the wallet ranker

The hardest day. Half of it is the P&L engine and half is proving it is right.

- FIFO position engine in `lib/pnl`, shared by the ranker and the portfolio
- Backfill positions over the chosen window across the tracked universe
- `wallet_metrics` per window, with shrinkage, minimums and the self-trade filter
- Scoring and `wallet_rankings`, written as generations under an advisory lock
- Reproducibility test: two runs over the same window produce byte-identical output
- Rankings table and wallet profile pages, with the definitions rendered in the UI
- Follow and unfollow, no wallet required

## Day 6: portfolio and alerts

- Portfolio from live balances joined to positions, unpriceable positions labelled
- Value chart from position snapshots
- Alert rule builder, batched evaluation job, cooldowns and dedupe
- In-app feed, badge, browser push
- Smart money panel on the token page, which is where following pays off

## Day 7: creation, polish, hardening

- Token creation: the fixed-template ERC-20, CREATE2 factory, v4 pool init and seed
- Review screen with the full cost breakdown, tested on testnet first
- Security headers and CSP, bundle key grep in CI
- Mobile pass on every screen, real device
- Every empty, error and stale state audited against the list in `05`
- Observability dashboard: indexer lag, job failures, gate rejections, funnels
- Launch checklist from `06`

---

## What is genuinely at risk

**Day 5 is the one that can slip.** The P&L engine is subtle: routers obscure the real trader,
multi-hop swaps produce legs that are not really entries, and transferred tokens have no cost
basis. If day 5 runs long, the correct cut is to ship the ranking over a 24-hour window first
and widen it in week two. A correct 24-hour ranking beats a wrong 7-day one, and the schema
already carries the window as a column so nothing downstream changes.

**Day 7 is the one to cut.** Token creation means writing, testing and deploying two contracts
in a day that also contains the hardening pass. If anything before it slipped, creation moves
to week two and day 7 becomes polish only. Shipping a rough token launcher that takes people's
liquidity is far worse than shipping without one.

**The unknown that could reorder everything** is the measured swap rate from day 0. If the
chain is producing far more events than the bounded universe can absorb on one worker, the
ranking window shrinks and Bitquery becomes the backfill for anything wider. That is a
configuration change, not a rewrite, which is the main reason for choosing this architecture.

## After week one

P1, in order: narrative tagging from token and pool activity, wallet following notifications
outside the app, deeper token metrics, ranking window widened to 30 days.

P2, only if the product is being used: any AI-assisted explanation, sophisticated social
signals, advanced trader scoring. None of it earns its place before people are trading.
