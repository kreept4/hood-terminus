# Verify

Built during Crypto World's Fair, October 2026.

## What it answers

Can I sell this after I buy it, and what will a trade cost me? Everything else Verify reports explains that answer.

## How it works

1. **Find the pool.** GeckoTerminal lists the token's pools; Verify simulates through the deepest one, because that is where a real sell would go.
2. **Learn the pool's shape from the chain.** A 32-byte id is a v4 pool, and its key (currencies, fee, tick spacing, hook) comes from its `Initialize` event on the PoolManager, searched in 10M-block windows starting near the pool's creation time. Anything else is probed: `fee()` means v3, `getReserves()` means v2.
3. **Fund the simulator.** ETH and WETH pools need nothing special. For USDG or stock-quoted pools, Verify finds the quote asset's balance slot in one call by overriding every candidate slot with a distinct marker and reading which one `balanceOf` returns. If that fails, it falls back to granting the token itself and testing the sell alone.
4. **Simulate.** `VerifySim` runs at a throwaway address inside one `eth_call`: buy about $10, sell everything back, and record what each pool promised against what arrived.
5. **Read the contract.** Bytecode is scanned for owner functions (mint, blacklist, pause, fee and limit setters, trading switches, upgrades), proxies are resolved through ERC-1967, beacon and ERC-1167 slots, and `owner()` decides whether those powers are live.
6. **Score.** Each check is pass, warn, fail or unknown. Any fail makes the verdict danger. An unknown sell test makes it unknown, never clear.

## Verified against mainnet, October 6, 2026

| Token | Pool | Result |
| --- | --- | --- |
| CASHCAT | Uniswap v3, 1% | Clear. 1.99% round trip, two pool fees. |
| ROO | Uniswap v4, no hook, 0% | Clear. 0.00% round trip. |
| ORE | Pons v4 hook | Caution, top holders only. 1.99% round trip, Pons's 1% each way. |
| BONER | Bankr v4 hook, quoted in HIMS | Clear. 2.97% round trip with the hook's dynamic fee. |
| ORBIO | Uniswap v4, quoted in USDG | Sell-only fallback passed. |
| PONS | Custom dynamic-fee hook, quoted in USDG | Caution: the hook can change the fee after the check. |

## Still to wire in once v1 is imported

- Render `VerifyPanel` on the token page and `VerifyBadge` in the trade panel. The token page is keyed by pool, so pass the base token address.
- Put `/api/verify` behind `lib/rate-limit`.
- Replace the local `WETH` constant in `lib/verify/client.ts` with the one in `lib/chain/contracts.ts`.
- Add `solc@0.8.26` as a dev dependency so `scripts/build-verify-sim.mjs` runs without `npx -p`.
- Add an amber token to `design/tokens.py`; `components/verify/tone.ts` falls back to a literal until then.
- Fix `Chip`'s `unknown` tone, which currently uses the green pass classes.
