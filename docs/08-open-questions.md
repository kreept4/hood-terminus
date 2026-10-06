# Assumptions I am challenging, and decisions I need

## Assumptions worth pushing back on

**1. That the meme market on this chain is still hot.**
The brief assumes a high-velocity meme environment. The verified picture is more complicated:
launches peaked around 18,600 a day, Noxa collapsed between 11 and 13 July, and DEX volume
cooled roughly 72% from the July 12 peak before recovering to record levels in late August on
the back of tokenised stocks and Uniswap v4. So the chain is busy, but a meaningful share of
that volume is stock tokens, not memes.

Consequence: if meme velocity has genuinely cooled, the live launch feed is a thinner product
than it looks and the wallet ranker becomes the main draw. The day-0 measurement settles this
before we commit the week. If launch rate is low but stock-token volume is high, the same five
tabs work with the emphasis shifted, and that is a positioning change rather than a rebuild.

**2. That "one week" and "nine P0 features" are compatible.**
They are not, at the quality bar the brief sets. Days 1 to 4 are realistic and produce a
product a stranger can trade on. Day 5, the wallet ranker, is the piece most likely to slip,
and day 7, token creation, is two contracts in a day that also contains hardening. Planning
for the cut now is cheaper than discovering it on Saturday.

**3. That we are competing on discovery.**
DexScreener, DexPaprika and several Robinhood Chain screeners already exist and are free. If
our pitch is "a screener", we lose. The defensible wedge is the wallet ranker plus a live feed
plus trading in the same surface, so the loop never leaves the product. That is why the ranker
gets its own day and why I would rather cut token creation than cut it.

**4. That guests need no identity at all.**
Guests need no *account*, but persisting a watchlist server-side needs some identity or the
write endpoint is open. Supabase anonymous auth gives a real `auth.uid()` with no UI, no email
and no friction, and RLS then works normally. That is the resolution, and it is worth naming
because "no account" and "no identity" are different things.

**5. That the platform will earn swap fees.**
Whether the Uniswap Trading API exposes interface-fee parameters to third-party keys is
UNKNOWN. If it does not, earning on swaps requires our own router contract, which is a
contract to write, test and audit, and is not a week-one item. The MVP business model should
therefore be launch fees plus an LP fee share, with swap fees added once the API question is
answered.

## Hidden constraints

- **No existing repository.** The brief says use the existing stack. There is none, so every
  stack choice in `02` is a real decision rather than an inherited one.
- **The indexer cannot live on Vercel.** Functions now support WebSockets and run to 300
  seconds, but an indexer needs indefinite uptime and a durable cursor. That means one
  always-on worker somewhere else, and it is the only stateful thing we operate.
- **Naming near Robinhood.** The chain is Robinhood's, and a product name or visual identity
  that borrows their marks is a trademark problem, not just a taste one. Worth a name that is
  adjacent rather than derivative.
- **Publishing a "smart money" leaderboard has a duty attached.** People will follow the
  wallets we rank. If someone games the ranking to build an audience and then dumps on it, we
  supplied the audience. The integrity filters in `06` exist for that reason, and the UI needs
  to say plainly that a rank describes past trades and is not a recommendation.

## Edge cases already designed for

Routed swaps where the router, not the trader, appears as the sender. Multi-hop swaps that
produce legs which are not real entries. Tokens received by transfer with no knowable cost
basis. Tokens with transfer taxes that make quoted output wrong. Pools with hooks that change
v4 behaviour. Symbol collisions and homoglyph impersonation. Rebasing or fee-on-transfer
supply. Pools created with negligible liquidity purely to appear in feeds. Wallets that trade
against themselves to manufacture volume. A user backgrounding the tab mid-transaction. A
quote that expires between review and signature.

Each of these has a stated handling in `03`, `05` or `06`. The ones without a good answer are
declared UNKNOWN in the UI rather than guessed.

## Decisions I need from you

**D1. Ranking window and whether to buy a backfill.**
A 24-hour window is computable from our own index on day 5 with confidence. A 7-day window is
the better product and is probably reachable. A 30-day window needs Bitquery at $49/mo.
My recommendation: build for 7 days, ship 24 hours if day 5 runs long, and only buy Bitquery
in week two if users ask for a longer history.

**D2. Does token creation ship in week one?**
It is P0 in the brief and last in the priority list. My recommendation: keep it scheduled for
day 7 but treat it as the designated cut. Two contracts plus a hardening pass in one day is
the least safe part of the plan, and a rough launcher that takes people's liquidity is worse
than no launcher.

**D3. Fee model for v1.**
My recommendation: a flat launch fee plus a share of the LP fee on tokens created through us,
and no swap fee until the Uniswap interface-fee question is resolved. Everything itemised on
the confirmation screen.

**D4. The name.**
No name yet. It affects the domain, the visual identity and the first screen, so it is worth
settling before day 1 rather than find-and-replacing on day 5.

## Still to verify before the code that depends on them

1. Universal Router 2.1.1 and Permit2 addresses on 4663, pinned into the allowlist
2. Uniswap Trading API interface-fee parameters for third-party keys
3. pools.trade factory address and ABI, if we ever want it as a second launch mode
4. Whether `viem/chains` exports chain 4663, otherwise we define it
5. GeckoTerminal free-tier rate limit
6. Measured swap and launch rate per minute on mainnet, which sizes everything
