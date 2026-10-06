# Decisions log

Approved 2026-09-03. These are settled. Anything that contradicts them is a change request,
not a preference.

## D1. Ranking window: 7 days, with a 24-hour fallback

Build the wallet ranker for a rolling 7-day window from our own bounded index. If day 5 runs
long, ship the 24-hour window and widen in week two.

**Why this is safe to defer.** `metric_window` is a column on `wallet_metrics` and
`wallet_rankings`, not a global constant. Widening the window is a job parameter and a backfill,
not a schema change or a UI change. The window label is rendered from the data, so no surface
can ever claim a longer history than was computed.

**Consequence for the ingest budget.** The tracked-pool universe must hold 7 days of swaps for
every pool a ranked wallet touched. That is the number the day-0 measurement sizes. If the
measured swap rate makes 7 days unaffordable on one worker, we ship 24 hours and revisit
Bitquery, rather than raising the RPC bill silently.

**Not doing.** No Bitquery in week one. Revisit only if users ask for longer history.

## D2. Token creation: day 7, designated cut

Attempt it on day 7. Drop it without further discussion if any earlier day slipped. The
hardening pass on day 7 is not cuttable; creation is.

**Why.** Two contracts (fixed-template ERC-20, CREATE2 factory) plus a v4 pool init and seed,
written, tested and deployed in the same day as the security pass, is the least safe part of
the plan. A rough launcher that takes people's liquidity is worse than no launcher.

**What ships either way.** The `/create` route exists in the nav from day 1 with an honest
"coming this week" state rather than a broken form. No fake flow.

## D3. Fees: launch fee plus LP share, no swap fee in v1

- Flat platform fee on token creation, charged in ETH at deploy time
- A share of the LP fee on pools created through us
- **No swap fee** until we confirm whether the Uniswap Trading API exposes interface-fee
  parameters to third-party keys

**Why not swap fees now.** If the API does not expose fee params, taking a swap fee means our
own router contract, which puts our code in the signing path. That is a contract to write, test
and audit, and it is not a week-one item. The trade path stays as thin as possible.

**Implementation constraint.** All of this lives in `lib/fees/config.ts` and nowhere else. No
component computes a fee. Every fee that will be charged appears itemised in USD on the
confirmation screen before any signature. When swap fees are added later, exactly one file
changes and the review screens pick it up automatically.

## D4. Name: pending

The user has a name. Until it lands, the app reads from a single `lib/brand.ts` constant, so
adopting it is a one-line change rather than a find-and-replace across the codebase.

Everything the name touches (page titles, the nav mark, metadata, the manifest) imports from
that module. Nothing hardcodes a product name anywhere else.
