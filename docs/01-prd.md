# PRD: Robinhood Chain trading terminal

Working title only. Naming is an open question, see `08-open-questions.md`.

## 1. What this is

A trading terminal for Robinhood Chain, built for people who trade new tokens fast.

The chain shipped 2026-07-01 with Uniswap as the primary AMM, hit roughly 18,600 launches a
day at peak, and now runs hundreds of millions in daily DEX volume. There is no native tool
that does discovery, verification, execution and wallet intelligence in one surface. Traders
are stitching together DexScreener, a block explorer, a wallet, and Twitter.

We collapse that into five tabs.

## 2. Who it is for

**Primary: the fast meme trader.** Watches new launches, wants to know within seconds whether
something is real, buys in three clicks, and cares more about who else is buying than about
any chart pattern. Already uses Photon, Axiom or GMGN on other chains and will judge us
against them.

**Secondary: the chain-curious Robinhood user.** Arrives because Robinhood Chain is in the
news, wants to browse without connecting anything, and needs the risk to be legible before
they touch it.

We optimise for the first and refuse to confuse the second.

## 3. The loop

    DISCOVER -> VERIFY -> TRADE -> TRACK -> REACT

Every screen serves exactly one step. If a screen serves two, it is the wrong screen.

## 4. Non-goals for v1

- Limit orders, stop losses, copy-trade automation, bots
- Cross-chain anything
- Social feed, comments, chat
- Any custodial feature. We never hold funds and never hold keys.
- Any surface that says "AI"

## 5. Navigation: exactly five

| Tab | Question it answers | Primary object |
|---|---|---|
| DISCOVER | What is happening right now? | Token |
| WALLETS | Who is actually trading well? | Wallet |
| TRADE | What do I want to buy, sell, or launch? | Order |
| PORTFOLIO | What is happening to my positions? | Position |
| ALERTS | What needs my attention? | Event |

Token pages and wallet pages are detail routes under Discover and Wallets, not sixth and
seventh tabs.

## 6. DISCOVER

The landing surface. Guest accessible, no wallet, no modal, no onboarding.

### 6.1 Live launches

A real-time stream of every token created on the chain, updating within a second of the pool
being initialised. This is the product's front door and the feature most likely to make
someone keep the tab open.

Each row: age (ticking), symbol and name, contract truncated with click-to-copy, initial
liquidity in USD, current liquidity, market cap, buys and sells in the last minute, dev
wallet holding percentage, and a risk chip.

The raw feed at peak is roughly 0.2 launches per second and mostly noise, so the feed ships
with filters on by default and the filter bar sits directly above it:

- Minimum liquidity, default $5,000
- Minimum age, default 0 so nothing is hidden by default
- Has socials
- Dev holding below a threshold
- Passed sell simulation
- Hide tokens whose symbol duplicates an existing higher-liquidity token

Filters persist per browser. The stream pauses on hover so a moving row can actually be
clicked, and shows a "N new" pill to resume. New rows arrive with a single 120ms fade.

### 6.2 Trending

Ranked by a deterministic momentum score over the last hour rather than raw volume, so one
wash-traded pool cannot occupy the top slot. The formula is published in-app.

### 6.3 Significant moves

Price and liquidity moves beyond a threshold in the last 15 minutes, both directions.
Liquidity removals get the same prominence as price pumps. A large LP pull is the single most
useful thing we can put in front of a trader and most tools bury it.

### 6.4 Search

Debounced. Matches symbol, name and contract address. A pasted address resolves to the token
page even if we have never indexed it.

### 6.5 Watchlist

Star any token. Per browser for guests, per wallet once connected. No account required.

## 7. Token page

Route `/t/[address]`. Must be readable in three seconds.

Above the fold: logo, name, symbol, contract with copy, price, 24h change, market cap,
liquidity, 24h volume, holder count, and BUY / SELL. The trade buttons are never below the
fold on any viewport.

Then the candlestick chart, with 1m / 5m / 15m / 1h / 4h / 1D. Real candles, real volume bars,
a crosshair, nothing else. No indicators in v1.

Then tabs, so the page does not become a wall:

- **Trades**: live tape of swaps, with wallet labels applied where the wallet is ranked or followed
- **Holders**: top 20 with concentration, dev wallet flagged
- **Liquidity**: pools, depth, LP lock status, LP add and remove history
- **Smart money**: which ranked or followed wallets hold, entered or exited, with timestamps

### 7.1 Risk panel

Deterministic checks only. No model, no score we cannot explain line by line. Each check
renders PASS / FAIL / UNKNOWN with a plain sentence:

- Contract verified on Blockscout
- Mint function present and callable
- Owner renounced
- Transfer tax, measured by simulating a buy and a sell with `eth_call`
- Sell simulation succeeds (honeypot check)
- LP burned or locked
- Top 10 holder concentration
- Creator wallet's previous launches and how they ended

UNKNOWN renders as UNKNOWN. We never round an unknown up to a pass.

## 8. TRADE

Route `/trade`, deep-linkable as `/trade?token=0x...`.

Panel: buy/sell toggle, amount with 25/50/75/max, estimated output, price impact, minimum
received, slippage control, route, gas estimate, wallet balance, and the full fee breakdown.

Wallet connection is requested here and nowhere else, at the moment the user presses trade,
not on page load.

Transaction states are explicit and never optimistic:

    REVIEW -> CONFIRM IN WALLET -> SUBMITTING -> CONFIRMED
                                              -> FAILED (with reason where determinable)

Price impact above 5% requires a second deliberate confirmation. Above 15% the button is
disabled with an explanation and an override behind a checkbox.

## 9. Token creation

Route `/create`. Last P0 item and the first thing cut if the week is tight.

Fields: name, symbol, logo, description, supply, optional socials, initial liquidity amount.
Decimals fixed at 18. No mint after deploy, no owner privileges, no transfer hooks. One fixed
contract template, so it is audited once and identical every time.

The confirmation screen states, in currency, before any signature: deployment gas, liquidity
committed, platform fee, LP lock duration, and the sentence "the liquidity you add can be
lost if the token does not trade". Two transactions, both signed by the user.

## 10. WALLETS

The differentiator. A ranked table of wallets that actually trade well, refreshed every 12
hours.

### 10.1 Definitions, stated in the product

"Win rate" is load-bearing, so we define it on the page, not in a footnote:

- **Trade leg**: one swap by a wallet in one pool.
- **Position**: FIFO lot accounting per (wallet, token). A buy is the token received for a
  quote asset. A sell is the token sent for a quote asset.
- **Completed trade**: a position whose token balance returned to within dust of zero.
- **Realized P&L**: proceeds minus FIFO cost basis, net of gas paid on both legs.
- **Win**: a completed trade with realized P&L above zero.
- **Win rate**: wins divided by completed trades, over the ranking window only. Open positions
  are excluded from win rate entirely.
- **Unpriceable position**: a token that entered the wallet by transfer rather than purchase.
  Cost basis is unknowable, so it is excluded from every metric and the wallet profile shows
  how many were excluded.

The ranking window is stated everywhere the ranking appears. If we rank over 7 days, no
surface says "all-time".

### 10.2 Score

Published formula, reproducible from the same inputs, no model:

    score = 0.30 * z(capped realized ROI)
          + 0.20 * z(shrunk win rate)
          + 0.15 * z(log realized P&L in USD)
          + 0.15 * z(consistency, 1 minus capped stdev of per-trade ROI)
          + 0.10 * z(early entry rate)
          + 0.10 * z(log volume in USD)

Win rate is shrunk toward the population mean by trade count, so three wins from three trades
does not outrank 40 from 55. Minimum 10 completed trades to qualify. Wallets whose volume is
dominated by trading against related addresses are removed by a counterparty-concentration
filter.

### 10.3 Wallet profile

Route `/w/[address]`. Address, window, score, rank, win rate, realized P&L, ROI, completed
trades, open positions, median hold time, tokens traded, early-entry rate, recent trades, and
the count of excluded unpriceable positions.

FOLLOW and UNFOLLOW require no wallet connection. This is public chain data.

## 11. PORTFOLIO

Enter an address, or connect. Total value, today's P&L, all-time P&L, holdings with position
size, average entry, current price, unrealized P&L, realized P&L. One clean value-over-time
chart. Nothing else.

Same cost-basis engine as the wallet ranker, so a user's own numbers and a tracked wallet's
numbers are computed identically. Unpriceable positions are labelled, not hidden.

## 12. ALERTS

Rules, not a firehose. Each rule is user-created and individually toggleable.

- A followed wallet bought or sold a token
- A ranked wallet entered a token within its first N minutes
- Liquidity on a watched token changed by more than X percent
- A watched token moved more than X percent in Y minutes
- Volume on a watched token spiked above N times baseline
- A watched token hit a price

Delivery in v1 is in-app plus browser push. No email, no Telegram, no webhooks until someone
asks. Per-rule cooldowns are mandatory so one volatile token cannot fire 40 alerts.

## 13. Voice

Short. Declarative. Numbers first.

Write: `LIQUIDITY PULLED. 92% removed 40s ago.`
Not: `Our analysis indicates a significant reduction in available liquidity.`

Write: `You're down 18.4%.`
Not: `Your position has experienced a decline.`

Write: `6 tracked wallets bought in the last 8m.`
Not: `Smart money interest is increasing.`

The product can be dry and a little sharp. It is never sarcastic about losses and never uses
urgency to push a trade. No countdown timers, no "don't miss out", no hot badges.

## 14. Design

Black foundation. Green up, red down, everything else grey. One accent colour, used only for
interactive affordance, never decoration.

Type does the work: a tight geometric sans for interface, a tabular monospace for every number
so columns align and prices do not jitter as digits change. Borders are 1px and low contrast.
Radius is 4px or 0. No gradients, no glass, no glow, no card inside a card inside a card.

Density is a feature. A trader wants 30 rows on screen, not 6 with generous padding.

Motion budget: 120ms fades on data arrival. Nothing else. No page transitions, no staggered
reveals, no shimmer that outlasts the fetch.

## 15. UX rules

- One click to any tab
- Two clicks to any useful number
- Three clicks from landing to a signable trade
- Guests reach every read-only surface with no wallet and no account
- Wallet connection is requested only at the point of signing
- Modals only for signing and destructive confirmation
- Every list has a real empty state that says what would fill it

## 16. Success criteria for the MVP

1. A trader lands cold, sees a launch happen live, and opens it. No account, no wallet.
2. From that token page they can tell in under five seconds whether it is a honeypot.
3. They connect and complete a buy in under 30 seconds.
4. The wallet ranking survives being read by someone who understands trading, because every
   number on it is defined and reproducible.
5. Nothing on any screen is fabricated. Unavailable data says unavailable.
