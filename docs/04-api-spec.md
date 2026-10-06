# API spec

Next.js route handlers. There is no separate backend service. Rules that apply to every
endpoint:

- Every input is parsed with zod at the boundary. An unparsed request never reaches a query.
- Addresses are validated as 20-byte hex and normalised to lowercase bytea before use.
- No endpoint returns raw on-chain strings. Symbols and names come from the sanitised
  `display_*` columns.
- Read endpoints are cached with explicit TTLs, listed per route.
- Write and proxy endpoints are rate limited per IP and, where a user exists, per user.
- Third-party keys (Alchemy, Uniswap, Bitquery) exist only in server environment variables.
  The browser never holds one.

Standard error envelope, so the client has exactly one shape to handle:

```json
{ "error": { "code": "RATE_LIMITED", "message": "Too many requests." } }
```

Codes: `BAD_REQUEST`, `NOT_FOUND`, `RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`,
`QUOTE_EXPIRED`, `INSUFFICIENT_LIQUIDITY`, `CHAIN_MISMATCH`, `INTERNAL`.

---

## Discover

### `GET /api/discover/launches`
Initial page of the live feed. The stream itself arrives over Supabase Realtime, this is only
the backfill so the list is not empty on load.

Query: `minLiquidityUsd` (default 5000), `maxAgeMinutes` (default 1440), `hasSocials`,
`maxDevHoldingPct`, `sellSimPassed`, `limit` (max 100), `cursor`.

Cache: 5s. Returns `{ items: LaunchRow[], nextCursor }`.

### `GET /api/discover/trending`
Ordered by `token_stats.momentum_score`. Query: `window` in `5m|1h|24h`, `limit` (max 50).
Cache: 15s.

### `GET /api/discover/movers`
Query: `direction` in `up|down|liquidity`, `limit`. Cache: 15s.
`liquidity` returns the largest 15-minute liquidity changes in both directions, removals
first. This is the endpoint that surfaces LP pulls.

### `GET /api/search`
Query: `q`, minimum 2 characters. Matches symbol and name by trigram, or resolves an address
directly. Cache: 30s. Rate limit: 30/min per IP.
An address that is not indexed returns a stub so the token page can still render from RPC.

---

## Token

### `GET /api/tokens/[address]`
Full header payload: token, primary pool, `token_stats` row, `token_risk` row.
Cache: 10s. 404 if the address is not a contract on chain 4663.

### `GET /api/tokens/[address]/candles`
Query: `tf` in `1m|5m|15m|1h|4h|1d`, `from`, `to`, `limit` (max 1000).
Reads `candles`. If our index has no history for a pool younger than the requested range, the
handler backfills once from GeckoTerminal, writes it, and serves from our table thereafter.
Cache: 5s for `1m`, 60s for `1d`.

### `GET /api/tokens/[address]/trades`
Recent swaps with wallet labels joined from `wallet_rankings` and the caller's follows.
Query: `limit` (max 100), `cursor`. Cache: 3s.

### `GET /api/tokens/[address]/holders`
Top 20 plus concentration. Sourced from Alchemy, cached 5 minutes in Postgres.

### `GET /api/tokens/[address]/risk`
Returns the `token_risk` row. If missing or older than 1 hour for a token under 24 hours old,
schedules a recompute and returns what exists with `stale: true`.
Never fabricates a result. Missing checks return `unknown`.

---

## Trade

All three of these proxy the Uniswap Trading API. The key stays server-side. Rate limit:
20/min per IP.

### `POST /api/trade/quote`
Body: `{ tokenIn, tokenOut, amount, side, slippageBps, taker }`.
Returns the quote plus our own fee line and a `quoteId` with a 20 second expiry.
Cache: none. Quotes are never cached across users.

### `POST /api/trade/approval`
Body: `{ token, amount, taker }`. Returns either `{ needed: false }` or an approval
transaction. Requests exact-amount approval, never unlimited.

### `POST /api/trade/swap`
Body: `{ quoteId, taker }`.

Before returning calldata this handler runs the validation gate, and it is the most
security-relevant code in the product:

1. `chainId === 4663`
2. `to` is in the pinned Universal Router allowlist for 4663
3. `recipient` decoded from calldata equals `taker`
4. token addresses and amounts match the quote the user was shown
5. quote is not expired
6. `value` is zero unless the input token is native ETH

Any failure returns `BAD_REQUEST` and logs to observability. We do not pass through calldata
we could not verify.

### `POST /api/tx/track`
Body: `{ txHash, kind, summary }`. Records the transaction so its state survives a refresh.
The server polls the receipt and updates `user_transactions`.

---

## Wallets

### `GET /api/wallets/rankings`
Query: `window` (default `7d`), `limit` (max 100), `cursor`.
Returns rank, address, score, and every component metric, plus `computedAt` and the window
label so the client can never render a ranking without stating what it measures.
Cache: 5 minutes. The underlying data only changes every 12 hours.

### `GET /api/wallets/[address]`
Metrics for all computed windows, plus `unpriceableCount` and `openPositions`.
An unranked address returns metrics computed on demand if it has at least one indexed trade,
otherwise `NOT_FOUND` with an explanation the UI renders as an empty state.

### `GET /api/wallets/[address]/trades`
Completed and open positions with entry, exit, hold time and realized P&L.
Query: `status` in `open|closed|all`, `limit`, `cursor`.

### `POST /api/follows` and `DELETE /api/follows/[wallet]`
Authenticated by the anonymous Supabase session. No wallet connection required.

---

## Portfolio

### `GET /api/portfolio/[address]`
Live balances from Alchemy joined against `positions` for cost basis. Returns total value,
today's P&L, all-time realized and unrealized P&L, and per-holding detail.
Positions marked `is_unpriceable` are returned with a null cost basis and a reason string, not
omitted. Cache: 15s per address.

### `GET /api/portfolio/[address]/history`
Daily value points for the chart, from position snapshots. Cache: 60s.

---

## Watchlist and alerts

### `GET|POST /api/watchlist`, `DELETE /api/watchlist/[token]`

### `GET|POST /api/alerts/rules`, `PATCH|DELETE /api/alerts/rules/[id]`
`params` is validated against a per-`kind` zod schema. A rule whose params do not match its
kind is rejected, not stored and ignored later.
Limit: 50 rules per user.

### `GET /api/alerts/feed`
Query: `unreadOnly`, `limit`, `cursor`.

### `POST /api/alerts/read`
Body: `{ ids }` or `{ all: true }`.

---

## Token creation

### `POST /api/launch/prepare`
Body: name, symbol, supply, description, socials, logo reference, initial liquidity.

Server-side validation before anything is returned:
- symbol 2 to 11 characters, name up to 32, both restricted to a printable ASCII subset so
  homoglyph and RTL-override tricks cannot reach another user's screen
- supply within bounds, decimals fixed at 18
- logo re-encoded server-side to PNG or WebP, EXIF stripped, SVG rejected outright
- socials must be `https` and match a host allowlist

Returns two unsigned transactions (deploy, then initialise and seed the pool) and a full cost
breakdown in USD: gas estimate, liquidity committed, platform fee, LP lock terms.

### `POST /api/launch/confirm`
Body: `{ txHash }`. Records the launch. The indexer will see the pool independently, so this
endpoint is a convenience for the creator's own UI state, not the source of truth.

---

## Cron, protected

Called by Vercel Cron, authenticated by a shared secret header, never reachable publicly.

| Route | Schedule | Work |
|---|---|---|
| `/api/cron/rollups` | every 60s | swaps to candles, refresh `token_stats` |
| `/api/cron/risk` | every 5 min | risk checks for tokens under 24h old |
| `/api/cron/alerts` | every 60s | evaluate enabled rules, respect cooldowns, write events |
| `/api/cron/rank` | every 12h | rebuild positions, metrics and rankings |
| `/api/cron/universe` | every 30 min | recompute which pools are tracked, tell the worker |
| `/api/cron/prune` | daily | drop expired partitions |
| `/api/cron/narratives` | every 6h | P1, category tags from token and pool activity |

Every one writes a `job_runs` row. A job that fails twice consecutively raises an alert to us,
not to users.

---

## Realtime channels

Supabase Realtime, read-only for clients, RLS enforced.

| Channel | Source | Used by |
|---|---|---|
| `launches` | inserts on `token_launches` | Discover live feed |
| `token:{address}` | inserts on `swaps` for that token's pools | token page tape and price |
| `alerts:{userId}` | inserts on `alert_events` | alert badge and toast |

The launch channel is the one that has to be fast. Peak observed launch rate on this chain was
roughly 0.2 per second, which is comfortable for a single Realtime channel. If it ever is not,
the fix is a server-side filtered fan-out, not a client-side one.
