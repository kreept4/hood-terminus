# Build log

One entry per phase of `13-hackathon-build-plan.md`. The README's "Built during
Crypto World's Fair" list is generated from this file.

## Phase 0: setup and history

**Date:** October 6, 2026

**What changed**

Rewrote the repository history so the pre-hackathon project is the first commit
and every later commit is hackathon work. `main` went from two commits to three:

1. `Import v1, built September 3 to 11, 2026, before Crypto World's Fair`
2. `Add MIT license and .gitignore`
3. `Add Verify: pre-trade sell simulation for Robinhood Chain tokens`

Version 1 came from the `rhc-terminal` folder, 234 files with their original
modification times recorded in `_file-dates.txt`. Generated build output was left
out of the import: the compiled contract artifacts under `contracts/artifacts`,
the TypeScript build cache `tsconfig.tsbuildinfo`, and `design/__pycache__`.
`__pycache__/` was added to `.gitignore`. That took the repository from 53.6 MB to
2.9 MB.

Corrected the hackathon disclosure in `README.md`. The previous wording said the
import contained v1 "exactly as it was deployed" and named no omissions, which
was not accurate once build output was dropped. It now states the production ship
time, names all three kinds of omitted build output, and points to
`_file-dates.txt` as the evidence for the date range.

Before this phase, `main` held only the license and Verify commits, so the full
application and the Verify feature had never existed in one tree. They do now.

**What was tested**

- All 234 imported files confirmed byte-identical to the source folder by md5,
  with modification times preserved.
- File dates verified to fall between 2026-09-03T16:46:49Z and
  2026-09-11T10:19:07Z, consistent with the 10:21 UTC ship time.
- Secret scan over every imported file: no private keys, seed phrases, Supabase
  service role keys, provider URLs with embedded keys, Privy secrets, Stripe
  keys, JWTs, or 64-character hex values assigned to a key, secret, private,
  signer or deployer name. Every credential is read through `process.env`. One
  Infura project ID in the contract build output traced to `forge-std`'s bundled
  default endpoints, a third-party public value, and that output is no longer in
  the repository.
- `git log` confirmed three commits in the required order with no build output
  tracked.
- Branches `v1-import` and `build-plan` deleted after the push; the plan is
  preserved here as `13-hackathon-build-plan.md`.

## Phase 1: foundations

**Date:** October 8, 2026

**What changed**

vitest, and `solc` pinned to an exact 0.8.26 rather than a caret range, because
`lib/verify/sim-artifact.ts` is only meaningful if a fresh build reproduces it
byte for byte. Scripts for `test`, `typecheck` and `build:verify-sim`.

CI in two jobs. The app job runs install, lint, typecheck, test and a build with
placeholder public env values, since `NEXT_PUBLIC_*` is inlined at build time.
The contracts job installs and tests that workspace on its own, which is now the
only thing checking it.

An amber ramp in `design/tokens.py` at hue 80, between the red at 33 and the
green at 123, carrying the same asserted WCAG contracts as the other ramps.
`Chip`'s `unknown` tone had been using the green pass classes while its own
comment said amber, so a check that could not run rendered identically to one
that passed.

`lib/verify/client.ts` takes WETH from `CONTRACTS` instead of holding a second
literal of the same address. `/api/verify` is limited to thirty a minute, keyed
by address as well as caller, and answers cross-origin on GET and OPTIONS.

**What was tested**

Contrast audit passes with amber at 10.85 on the page ground, 9.89 on a cell and
8.16 on its own fill. `build:verify-sim` reproduces the committed artifact
exactly, once `.gitattributes` pinned Solidity sources to LF: solc hashes the
source bytes into the bytecode metadata, so a CRLF checkout compiled to the same
code with a different trailing hash. CORS preflight and headers verified against
the running server.

## Phase 4 and 5: Travis, the homepage, and the truth sweep

**Date:** October 8 and 9, 2026

**What changed**

Verify was written, tested and unreachable: the panel was imported by nothing,
there was no `/verify`, and production served a 404 for the API. It is now on
every token page under the chart, in the trade panel as a verdict with a confirm
before a risky buy, and at `/verify` for an address somebody was sent.

It is called Travis, and the name is a preference you can change. The panel
carries a refresh button, because reports cache for a minute and a token minted
ten minutes ago can change what it allows between checks, and it collapses,
because the verdict is the answer and the checks are the working.

Two faults made Travis useless on the pairs that matter. Pools were located only
through GeckoTerminal, so a rate limit became "market data is unavailable" on
WETH against USDG; there is now a fallback to the v3 factory. And v4 pool keys
are recovered from an `Initialize` event, which the configured RPC refuses to
look for: its free tier caps `eth_getLogs` at ten blocks on a chain past block
84,000,000. Log queries now go to the public endpoint, which allows ten million.

The homepage opens with the chain rather than a pitch, the hero states plainly
that Travis never uses your money, and the navigation leads with the check.

The truth sweep found the launchpad promising "a fee on every trade, for as long
as it trades". The contract stops paying the creator at graduation. Every such
claim now says the share is of the 1% fee and is earned while the token is still
being funded, and the percentage is read from the chain rather than written down.

**What was tested**

Travis on the v4 WETH/USDG pool: a $10 buy and immediate sell both went through,
0.14% round trip, no buy tax, no sell tax. The same token reported "pool key not
found" before the endpoint change. Candles recovered from 0 to 300 on the 5m
timeframe after the retry and stale-cache change, and 1m returns 300 candles on
six consecutive calls with no duplicate timestamps and 299 ascending steps.
Launchpad figures read live from the contract: `TRADE_FEE_BPS` 100,
`creatorShareBps` 6000, `MIN_CREATOR_SHARE_BPS` 5000, `GRADUATION_ETH` 4 ether.

## Phase 5 and 6: the session, the wallet, and measurement

**Date:** October 9, 2026

**What changed**

A connected wallet now lasts for the session and no longer. wagmi writes its
state to a cookie with no expiry, which a browser is meant to drop when it
closes and in practice often does not: Chrome keeps running after its last
window shuts, and "continue where you left off" restores session cookies
deliberately. So somebody came back hours later still connected.

Worth being accurate about the stake. Being connected is not a route to
spending, because every transaction is signed in the wallet and the wallet's own
lock is what protects the money. What it leaks is the address and the portfolio
behind it, to whoever opens the laptop next. `sessionStorage` is the one browser
store with the lifetime wanted, surviving a reload and same-tab navigation and
dropped when the tab closes, so the rule is: connected with no marker in this
tab means the connection came from a previous session, and it is ended. The cost
is that a second tab is a new session and disconnects the first, which is the
right way round.

Disconnect also did not disconnect, for two separate reasons. wagmi keeps a map
of simultaneous connections and `disconnect()` with no argument ends only the
active one, so with several wallets authorised, pressing Disconnect ended the
first and promoted the next, which is the second wallet that kept appearing.
Fixing that exposed the second reason: wagmi reconnects on mount, and
`shimDisconnect` is what tells a connector not to. It is set on the `injected()`
fallback and cannot be set on connectors built from EIP-6963 announcements,
which is every wallet anybody actually has installed. A disconnect held until
the next render and then undid itself. There is now an app-side record of the
request, set before disconnecting so a wallet that hangs cannot lose it, and
honoured on every connection that appears until somebody picks a wallet.

Vercel Analytics, which counts page views without a cookie or a cross-site
profile, and the privacy notice says so in those terms.

**What was tested**

Lint, typecheck and the 14 unit tests pass, and `next build` completes. The
disconnect path was traced by hand across the connection map rather than in a
browser automation harness: the fault only appears with EIP-6963 connectors from
real extensions, and a fresh automated browser has none, so it would exercise
only the fallback connector that was never broken.
