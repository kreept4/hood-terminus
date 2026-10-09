# Hood Terminus

The trading terminal for Robinhood Chain. Find new tokens, check who is trading them, trade, track wallets and launch your own, in one place.

**Live:** https://hood-terminus.vercel.app
**Chain:** Robinhood Chain mainnet (chain ID 4663)

## Why it exists

Robinhood Chain went live on July 1, 2026 with Uniswap as its main exchange, and new tokens arrive by the thousand every day. Traders follow them by stitching together a block explorer, a chart site, a wallet and X. Tokens still on a launchpad's bonding curve are worse off: they have no pool yet, so the usual chart sites cannot see them at all.

Hood Terminus puts discovery, trading, wallet intelligence and launching on one surface, built for this chain rather than ported from another.

## What it does

| Tab | What you get |
| --- | --- |
| Discover | Every indexed pair on the chain, with trending, new pairs, tokens on the curve, gainers, losers, volume and liquidity views. Filter by quote asset: ETH, USDG or tokenized stocks such as NVDA, SPCX and HIMS. |
| Wallets | Wallets ranked by realised profit in ETH over the last seven days, using closed positions matched first in, first out. Win rate, wins and losses, and bot filtering. Track any wallet. |
| Trade | Swaps through Uniswap's UniversalRouter with slippage control, minimum received and price impact shown before you sign. Buying with ETH takes one transaction and one signature, with no token approval. |
| Portfolio | Holdings and value for a connected wallet. |
| Alerts | Price alerts on any token, checked while the app is open. |
| Launch | Create a token with no money of your own. Buyers fund it on a bonding curve, and once it raises 4 ETH it graduates into a Uniswap pool. The creator takes a share of the 1% trade fee while the token is on the curve. |
| Verify | Travis checks a token before you buy it. He buys about $10 of it and sells it straight back inside a copy of the chain, and tells you whether selling worked, what it cost, who controls the contract and what the pool's own rules allow. Nothing is signed and no money is used. On the token page, in the trade panel, and at `/verify` for an address somebody sent you. |

## Robinhood Chain integration

Every contract address the app uses was read from the chain and proven, not copied from another network. The method: take a live pool, ask it for its factory and tokens, then confirm the factory returns that same pool. This mattered, because the canonical Uniswap V3 factory address holds a different contract on Robinhood Chain, and using it would have failed silently. The full method is documented in `lib/chain/contracts.ts`.

Launches can be paired against ETH, USDG or Robinhood's tokenized stocks.

## Verify: can I get out?

The question every trader on a new chain asks first is whether they can sell what they are about to buy. Verify answers it by doing it, without spending anything.

It injects a small simulator contract into a single `eth_call` using a state override, funds it, buys about $10 of the token through the pool people actually trade in, and sells it straight back. Nothing is signed or broadcast. It then compares what each pool promised with what actually arrived, which is where sell blocks, transfer taxes and hook fees show up.

It works on Uniswap v2 and v3 pools and on v4 pools with hooks, which matters here: on Robinhood Chain most new tokens trade through v4 hooks run by launchpads such as Pons and Bankr. Verify recovers each pool's key from the chain, over the public RPC rather than the configured one, because a free tier that caps `eth_getLogs` at ten blocks cannot find an event on a chain past block 84,000,000; reads the hook's permissions from its address, and names the launchpad when it recognises one. Pools quoted in USDG or tokenized stocks are funded by overriding the quote asset's storage, with a sell-only fallback when that layout is unknown.

Alongside the simulation it reads the token's bytecode for owner powers (minting, blocking wallets, pausing, changing taxes) and proxies, and GeckoTerminal for holder concentration, creator holdings, liquidity and buy and sell counts. A check that cannot run reports **unknown**, never a pass.

The simulator is `contracts/verify/VerifySim.sol`. The engine is `lib/verify/`, served at `GET /api/verify/:address`.

## Architecture

- **App:** Next.js (App Router), React, TypeScript, Tailwind CSS
- **Chain access:** viem and wagmi. You connect a wallet you already have; there is no sign-in
- **Data:** Supabase Postgres for the pool index, swaps and wallet profit and loss
- **Indexing:** scripts in `scripts/` and `worker/` index pools, watch swaps and roll up wallet results
- **Market data:** GeckoTerminal for pool prices and metadata
- **Contracts:** the launchpad and token template live in `contracts/`

Design and planning documents are in `docs/`, including the product spec, architecture options, data model, API spec, and threat and failure analysis.

## Running it locally

```bash
npm install
cp .env.example .env.local   # then fill in your own values
npm run dev
```

Open http://localhost:3003.

The port is pinned to 3003 in the `dev` script. Next picks the next free port
when its default is busy, and a port that moves on its own is a source of
faults that look like code and are not.

## Hackathon disclosure

Hood Terminus is entered in Colosseum's Crypto World's Fair, which opened on September 14, 2026.

Version 1 was built between September 3 and September 11, 2026, before the hackathon began, and shipped to production at 10:21 UTC on September 11. The first commit in this repository, "Import v1", is that project as it stood: every file in it was last modified between September 3 and September 11. `_file-dates.txt` in that commit lists the last modified time of every file copied from the original folder, so the dates can be checked. Only generated build output was left out: the compiled contract artifacts, the TypeScript build cache, and a Python bytecode cache. Everything committed after it was built during the hackathon and is listed below.

### Built during Crypto World's Fair

- **Verify, as an engine** (October 2026): pre-trade sell simulation through v2, v3 and v4 pools including launchpad hooks, contract power and proxy checks, and market checks, with an API route.
- **Travis** (October 2026): the check made visible and given a name you can change. A panel on every token page, a verdict and a confirm before a risky buy in the trade panel, and `/verify` for an address somebody sent you. Public API at `GET /api/verify/:address`, rate limited and CORS-enabled.
- **v4 pools made checkable** (October 2026): pool keys are recovered over an endpoint that answers ranged log queries, which is what made most pairs on this chain testable at all.
- **Resilience and honesty in the data layer** (October 2026): market requests back off and fall back to the last good answer, so a rate limit degrades to slightly old data rather than an empty chart, and a failed load says it failed instead of claiming a pool has no history.
- **Plain language, and claims checked against the contract** (October 2026): the launchpad no longer promises fees after graduation, which it never paid, and the fee split is read from the chain rather than written down.
- **Wallets only** (October 2026): the embedded-wallet sign-in was removed after it proved unable to create a wallet on this app, and the terms and privacy notice were rewritten to match.

## License

MIT. See [LICENSE](LICENSE).
