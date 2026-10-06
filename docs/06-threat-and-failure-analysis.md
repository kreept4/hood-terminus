# Threat and failure analysis

Written adversarially. Assume someone is trying to drain a user through our UI, game our
ranking, or run up our infrastructure bill for fun.

Ranked by severity. Severity is (how bad if it happens) times (how likely it is on a chain
where the median token is a scam).

---

## S1: can cost a user their money

### 1.1 Unverified swap calldata reaching the wallet

**Why it matters.** We hand our users transaction data produced by an upstream API and ask
them to sign it. If that response is ever wrong, whether through a compromised key, a DNS
hijack, a proxy bug, or a malicious response, the user signs a transfer of their balance to an
attacker and we are the delivery mechanism. This is the single worst thing that can happen in
this product.

**Fix.** The validation gate in `/api/trade/swap`, and again client-side before
`sendTransaction`:
- `chainId === 4663`
- `to` is in a pinned, hardcoded allowlist of Universal Router addresses for 4663
- the recipient decoded from calldata equals the connected address
- token addresses and amounts match the quote the user was shown
- `value` is zero unless the input token is native ETH
Two independent checks, because the server one protects against a bad upstream and the client
one protects against a compromised server response.

**Monitor.** Count gate rejections. Steady state is zero. Any non-zero rate is an incident,
not a metric.

### 1.2 Service role key reaching the browser

**Why it matters.** The Supabase service role key bypasses RLS entirely. In a client bundle it
is full write access to every table, including the ranking.

**Fix.** Service role key exists only in the worker and in server-only modules marked with
`import 'server-only'`. A CI step greps the built client chunks for the key prefix and fails
the build on a hit. `NEXT_PUBLIC_` is reserved for the anon key and the chain ID, nothing else.

### 1.3 Token metadata as an attack surface

**Why it matters.** Token names and symbols are attacker-controlled strings from a
permissionless chain. Three attacks: script injection if we ever render them as HTML,
homoglyph impersonation (Cyrillic `а` in `USDС`) to make a scam token look like a real one,
and RTL override characters to make `SCAM‮gnp.` render as something else entirely.

**Fix.** Sanitise on ingest, not on render: strip control characters and bidi overrides,
normalise Unicode to NFKC, restrict display strings to a printable subset, cap length, and
store the result in `display_symbol` and `display_name`. The UI only ever reads the display
columns. `dangerouslySetInnerHTML` appears nowhere in the codebase and a lint rule enforces
that. Logos are proxied and re-encoded server-side, SVG is rejected, and the contract address
is always shown next to the symbol so identity never rests on the name alone.

Additionally: flag any token whose display symbol collides with a higher-liquidity token, and
show that collision in the UI rather than silently ranking both.

### 1.4 Signing on the wrong chain

**Why it matters.** A user connected to Ethereum mainnet pressing BUY sends a transaction to
an address that means something different, or nothing, on that chain. On a chain this new,
plenty of wallets will not be on 4663 by default.

**Fix.** A chain guard component wraps every signing path. The trade button is disabled, not
merely warned about, until `chainId === 4663`, and offers a one-click switch or add-network.
The chain object is defined once in `lib/chain` and imported everywhere.

### 1.5 Approval scope

**Why it matters.** Unlimited approvals are the standard way users lose funds months after the
fact, when a router or a spender is exploited.

**Fix.** Permit2 signatures where the Trading API supports them, exact-amount approvals
otherwise, never `MaxUint256`. The approval screen names the spender, the token and the exact
amount in plain language.

---

## S2: can corrupt our data or take the product down

### 2.1 A WebSocket that dies without erroring

**Why it matters.** This is the most common way a live feed breaks. The socket stays open, no
error fires, and no messages arrive. The launch feed looks healthy and is silently frozen, so
users believe the chain went quiet. On a 100ms-block chain this is very easy to miss.

**Fix.** A liveness watchdog independent of the socket: the worker separately polls block
height every 3 seconds. If the head advances but no log has arrived in 10 seconds, tear down
and reconnect from the durable cursor. Track connection age and reconnect count.

**Monitor.** `indexer_lag_blocks` (chain head minus last processed) is the primary health
signal for the whole product. Alert above 100 blocks sustained.

### 2.2 Duplicate ingest double-counting P&L

**Why it matters.** WebSocket delivery is at-least-once, and a reconnect replays from the
cursor. A duplicated swap inflates volume and, worse, corrupts a wallet's realized P&L and
therefore its published rank.

**Fix.** Primary key on `(block_time, tx_hash, log_index)` and `insert ... on conflict do
nothing`. Idempotency is enforced by the schema, not by application logic, because application
logic is what fails at 3am.

### 2.3 Overlapping ranking jobs

**Why it matters.** Two `rank` runs writing at once produce a ranking that is half from one
generation and half from another. Users see a top 100 that does not sum.

**Fix.** A Postgres advisory lock per job name, plus generation-based writes: each run inserts
a new `computed_at` cohort and readers select the newest complete one. A ranking is never
partially visible.

### 2.4 Reorgs and sequencer rollbacks

**Why it matters.** Orbit chains have fast soft finality and reorgs are rare, but "rare" is not
"never", and a rolled-back block leaves phantom launches and phantom trades in our tables.

**Fix.** Store `last_block_hash` on the cursor. On each batch, verify the parent hash matches
what we stored. On mismatch, delete rows above the divergence point and re-ingest. Cheap
because our tables are keyed by block.

### 2.5 Vendor or RPC outage

**Why it matters.** Alchemy, GeckoTerminal or the Uniswap API going down should degrade the
product, not blank it.

**Fix.** Per-vendor circuit breaker with a short open period. Serve the last good cached
value with an explicit stale marker rather than an error. The product's core read path
(Discover, token pages, wallets) reads Postgres and survives every vendor being down. Only
quoting and holder counts hard-depend on a vendor, and both fail closed with a clear message.

### 2.6 Unbounded backfill burning the RPC budget

**Why it matters.** A naive `eth_getLogs` sweep over 25 million blocks is how a free tier
becomes a four-figure invoice overnight.

**Fix.** The tracked-pool universe is bounded and recomputed on a schedule. The worker holds a
compute-unit budget per hour and refuses to exceed it, logging the shortfall instead. Backfill
runs in explicit, resumable chunks with a cursor. Measure the real event rate for one hour
before choosing the universe size, which is task one of day one.

### 2.7 Alert storms

**Why it matters.** One volatile token can generate dozens of events per user in a minute.
That is the fastest way to make people turn alerts off permanently.

**Fix.** Per-rule cooldown (default 300s), a per-user hourly cap, and a dedupe key on
`(rule_id, token, bucketed_minute)` so the same condition cannot fire twice within a bucket.
Rules are evaluated in one batched query per kind, not per rule, so the job cost does not grow
with user count.

### 2.8 Quote and execution race

**Why it matters.** Price moves between the quote and the signature. On a meme token that gap
can be enormous, and a stale quote that executes is a user losing money on our numbers.

**Fix.** 20 second quote expiry enforced server-side, minimum-received enforced on-chain by the
router, automatic re-quote on expiry with a visible countdown, and a hard block above 15%
price impact behind an explicit override.

---

## S3: abuse, cost and integrity

### 3.1 Our API proxy used as a free Uniswap API

Rate limit by IP on every proxy route (20/min for quotes, 30/min for search), plus Vercel
BotID on the trade routes. Without this, someone points a bot at `/api/trade/quote` and spends
our key's quota.

### 3.2 Gaming the wallet ranking

**Why it matters.** We are publishing "these wallets trade well", and people will follow them.
Anyone who can manufacture a top-10 rank can pump a token into an audience we built for them.
This is a reputational risk, not just a data-quality one.

**Fix.**
- Minimum 10 completed trades to qualify
- Bayesian shrinkage on win rate so small samples cannot top the board
- Counterparty concentration filter: a wallet whose volume is mostly against a small set of
  related addresses is excluded
- Minimum unique tokens and minimum unique counterparties
- Exclude trades in pools where the wallet is also the liquidity provider
- Cap the ROI term so one 400x does not permanently outrank consistent performance
- Publish the formula and the window, so a suspicious rank can be audited by a user

We should also say plainly in the UI that a rank is a description of past trades, not a
recommendation.

### 3.3 Search as a cheap DoS

Trigram scans over a growing token table are not free. Minimum two characters, hard `LIMIT`,
30 second cache, per-IP rate limit, and an address-shaped query short-circuits to a primary key
lookup.

### 3.4 Table growth and vacuum pressure

`swaps` is the only table that grows fast. Daily range partitions, a nightly drop of expired
partitions, and rollups holding the long-term history. Dropping a partition is instant.
Deleting 40 million rows is an outage.

### 3.5 Stale derived data presented as live

If `/api/cron/rollups` fails, `token_stats` silently ages and Discover shows minute-old prices
as though they were current. Every surface reading `token_stats` renders a staleness dot from
`updated_at`, and a stats row older than 5 minutes is labelled, not shown as fresh.

---

## S4: UX and correctness details that still matter

- **Float precision.** Token amounts are `bigint` and `numeric` end to end. A `number` never
  touches a token amount. Formatting to a display string happens once, in `<Value>`.
- **Colour-only signalling.** Green and red always ship with a sign and a direction, so the
  product is readable to a colour-blind trader and in a screenshot.
- **Tab backgrounded mid-transaction.** `user_transactions` persists the pending state, so a
  refresh or a mobile app switch resumes the correct status rather than losing it.
- **Offline.** A network-state hook pauses queries and shows one thin banner. The chart keeps
  its last data rather than clearing.
- **Corrupt local storage.** Filter and watchlist reads are parsed through zod with a fallback
  to defaults. A malformed value never white-screens the app.
- **MEV.** Tight default slippage (1% on liquid pairs, user-adjustable), UniswapX routes
  preferred where available, and price impact always shown before signing. We do not claim
  protection we cannot deliver.

---

## Observability

Minimum set, from day one, because none of this is retrofittable cheaply.

**Health signals**
- `indexer_lag_blocks`, `ws_reconnects_per_hour`, `swaps_ingested_per_minute`
- `job_runs` failures, per job, alerting on two consecutive failures
- `token_stats` staleness, p95
- upstream error rate and p95 latency, per vendor
- RPC compute units consumed per hour against budget

**Security signals**
- calldata validation gate rejections, alerting on any
- rate limit hits by route
- risk checks that flip from pass to fail on an already-listed token

**Product funnels**
- Discover view to token page to trade panel to quote to signature to confirmed
- guest to wallet connection conversion
- token creation: form start to review to deploy confirmed
- alerts created, fired, opened

Privacy: no email, no IP retention beyond the rate-limit window, no wallet address joined to
any identity we hold. Wallet addresses are already public chain data and are treated as such,
but we do not attach them to a session identifier in analytics.

## Launch checklist

- [ ] CSP with no `unsafe-eval`, `connect-src` limited to our API, Supabase and the RPC host
- [ ] HSTS, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, frame-ancestors none
- [ ] Client bundle greps clean for service-role and vendor key prefixes
- [ ] RLS enabled and verified with an anonymous session on every user table
- [ ] Rate limits live on all proxy and search routes
- [ ] Calldata validation gate covered by tests including deliberately malformed responses
- [ ] Every surface has loading, empty, error and stale states
- [ ] Chain guard verified by connecting on the wrong network
- [ ] Full trade path executed on testnet (46630) and then with real, small size on mainnet
- [ ] Indexer restart resumes from cursor with no duplicates and no gap
- [ ] Ranking job reproducible: two runs on the same window produce identical output

## Rollback

The app is Vercel, so rollback is an instant promotion of the previous deployment. The two
things that do not roll back automatically:

- **Schema migrations.** Forward-only and additive during the MVP. No destructive migration
  ships in the same deploy as the code that depends on it.
- **The indexer.** Versioned separately from the app, so a bad app deploy never stops ingest,
  and a bad worker deploy is a container rollback with the cursor intact. If the worker is down
  the product still reads, it just stops updating, which is the correct failure mode.
