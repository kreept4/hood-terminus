# Robinhood Chain: what actually exists

Verified 2026-09-03. Everything below was checked against primary sources. Anything not
verified is marked UNKNOWN and must be confirmed on-chain before it is built against.

## Chain

| Item | Value | Status |
|---|---|---|
| Network | Robinhood Chain, Arbitrum Orbit L2, ETH gas token | VERIFIED |
| Mainnet chain ID | 4663 | VERIFIED |
| Mainnet RPC | `https://rpc.mainnet.chain.robinhood.com` (rate limited, not for production) | VERIFIED |
| Testnet chain ID / RPC | 46630 / `https://rpc.testnet.chain.robinhood.com` | VERIFIED |
| Explorer | `https://robinhoodchain.blockscout.com` | VERIFIED |
| Block time | ~100ms | VERIFIED |
| Contract deployment | Permissionless, no allowlist, no Robinhood account needed | VERIFIED |
| Validator set | Permissioned (Offchain Labs + Alchemy), allowlist + 1 WETH bond | VERIFIED |
| Mainnet live since | 2026-07-01 | VERIFIED |
| Tooling | Hardhat, Foundry, ethers, viem, wagmi all documented as supported | VERIFIED |

Consequence: the meme-coin premise is sound. Anyone can deploy an ERC-20 and anyone can
index the chain. The permissioned validator set is a decentralisation caveat worth one line
in our own docs, not a blocker.

## Liquidity and market activity

- Uniswap v2, v3, v4 and UniswapX are all live on 4663, deployed day one as the primary public AMM. VERIFIED
- Uniswap handles roughly 90% of chain DEX volume (v4 ~$432M + v3 ~$357M on the 2026-08-30 peak day). VERIFIED
- Record daily chain DEX volume ~$944M to $1.58B depending on source and day. VERIFIED-ish, figures vary by source
- ~17,287 liquidity pools tracked as of 2026-08-16. VERIFIED
- Memecoins dominate early activity; tokenised stocks were ~4% of early volume. CASHCAT is the chain mascot. VERIFIED
- Launchpad peak was ~18,600 token launches/day. Noxa collapsed 11-13 July and volume cooled ~72% off the July 12 peak. VERIFIED
- Current active launchpads: hood.fun, PONS, Uniswap's pools.trade (public 2026-08-05, contracts live since 2026-07-08), TrustSwap Launchpad. VERIFIED

Consequence: there is real volume and real launch velocity to build a discovery product on.
The launch rate at peak was ~0.2 tokens/second, which a single WebSocket log subscription
handles comfortably.

## Swap routing

| Item | Value | Status |
|---|---|---|
| Uniswap Trading API base | `https://trade-api.gateway.uniswap.org/v1` | VERIFIED |
| Auth | `x-api-key` header, self-serve key at developers.uniswap.org/dashboard | VERIFIED |
| Chain 4663 support | Supported. UniswapX v3 supported. | VERIFIED |
| Universal Router on 4663 | Defaults to 2.1.1. Requesting 2.0 errors, there is no 2.0 deployment. | VERIFIED |
| Endpoints | `/quote`, `/swap`, `/check_approval` | VERIFIED (names), shapes to confirm against live dashboard docs |
| Interface fee params (`portionBips` / fee recipient) exposed to third-party keys | UNKNOWN | MUST VERIFY before promising swap fee revenue |
| Universal Router + Permit2 addresses on 4663 | UNKNOWN, must be read from Uniswap deployments and pinned | MUST VERIFY |

## Data and indexing

| Source | What it gives | Cost | Status |
|---|---|---|---|
| Alchemy | Full RPC + WebSocket (`wss://robinhood.g.alchemy.com/v2/KEY`), `eth_subscribe`, webhooks, token/transfer data APIs | Free tier then usage | VERIFIED |
| Blockscout | Explorer + REST API, contract verification status | Free | VERIFIED |
| GeckoTerminal | Network slug `robinhood`. Trending pools, new pools, OHLCV, token info. Free, no key. | Free, rate limited (limit to confirm) | VERIFIED slug, rate limit UNKNOWN |
| DexScreener | `dexscreener.com/robinhood` surface + public API | Free | VERIFIED |
| Bitquery | Robinhood Chain GraphQL + WebSocket subscriptions + Kafka. DEX trades with USD, OHLCV, launchpad events for PONS / pools.trade / Flap.sh / trench.today / Bags.fm, transfers, balances, holder rankings. | From $49/mo | VERIFIED |
| Allium | On-chain analytics, named Robinhood Chain partner | Enterprise | VERIFIED, likely out of budget |

## Unknowns that block specific features

1. **pools.trade factory address and ABI.** Bitquery documents *reading* pools.trade events.
   Creating a token *through* pools.trade from our UI needs their contract address and ABI,
   which is not published in anything I found. Until confirmed, token creation ships as our
   own ERC-20 factory plus a Uniswap v4 pool, not as a pools.trade wrapper.
2. **Uniswap interface fee parameters on third-party API keys.** Determines whether we can
   earn a swap fee without deploying our own fee-taking router. Affects the business model,
   not the product.
3. **`viem/chains` export for chain 4663.** If absent we define the chain object ourselves,
   which is four lines. Non-blocking.
4. **GeckoTerminal free-tier rate limit.** Affects how hard we can lean on it before our own
   index is warm. Non-blocking, we cache regardless.
5. **Swap event volume per day on 4663.** Drives the wallet-ranking ingest budget. Must be
   measured with a one-hour `eth_getLogs` sample before committing to a ranking window.

## Sources

- https://docs.robinhood.com/chain/
- https://robinhood.com/us/en/support/articles/robinhood-chain-mainnet/
- https://l2beat.com/layer2s/projects/robinhood
- https://blog.uniswap.org/robinhood-chain-is-live
- https://developers.uniswap.org/docs/trading/swapping-api/supported-chains
- https://developers.uniswap.org/docs/api-reference/create_swap_transaction
- https://www.alchemy.com/rpc/robinhood
- https://docs.bitquery.io/docs/blockchain/robinhood/
- https://docs.bitquery.io/docs/blockchain/robinhood/pools-trade-api/
- https://dexscreener.com/robinhood
- https://dexpaprika.com/robinhood
