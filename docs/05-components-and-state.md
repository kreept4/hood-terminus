# Components, state and folder structure

## Route map

```
/                       Discover
/t/[address]            Token detail
/wallets                Rankings
/w/[address]            Wallet profile
/trade                  Trade, deep-linked as /trade?token=0x..&side=buy
/create                 Token creation
/portfolio              Own or entered address
/alerts                 Rules and event feed
```

Eight routes, five tabs. `/t` and `/w` are detail routes, `/create` is reached from inside
Trade. Nothing else exists in v1.

## Folder structure

```
app/
  layout.tsx                     root shell, fonts, theme, providers
  page.tsx                       Discover
  t/[address]/page.tsx
  wallets/page.tsx
  w/[address]/page.tsx
  trade/page.tsx
  create/page.tsx
  portfolio/page.tsx
  alerts/page.tsx
  api/                           route handlers, mirrors 04-api-spec
components/
  primitives/                    the design system, no product knowledge
    Value.tsx  Delta.tsx  Stat.tsx  Chip.tsx  Table.tsx  Sheet.tsx
    Tabs.tsx   Empty.tsx  Skeleton.tsx  ErrorPanel.tsx  Address.tsx
  token/
    TokenLogo.tsx  TokenRow.tsx  TokenTable.tsx  TokenHeader.tsx
    CandleChart.tsx  TradeTape.tsx  HolderTable.tsx  RiskPanel.tsx
    LiquidityPanel.tsx  SmartMoneyPanel.tsx
  discover/
    LaunchFeed.tsx  LaunchFilters.tsx  TrendingList.tsx  MoversList.tsx
    SearchCommand.tsx  WatchStar.tsx
  wallet/
    WalletRow.tsx  WalletTable.tsx  WalletHeader.tsx  WalletPerformance.tsx
    MetricDefinition.tsx  FollowButton.tsx
  trade/
    TradePanel.tsx  SideToggle.tsx  AmountInput.tsx  QuoteBreakdown.tsx
    SlippageControl.tsx  ImpactWarning.tsx  ConnectGate.tsx  TxStatus.tsx
  create/
    CreateForm.tsx  LogoUpload.tsx  LaunchReview.tsx  CostBreakdown.tsx
  portfolio/
    PositionRow.tsx  PositionTable.tsx  PnLHeader.tsx  ValueChart.tsx
  alerts/
    RuleBuilder.tsx  RuleList.tsx  AlertCard.tsx  AlertFeed.tsx
lib/
  chain/       chain config, viem clients, address codec, abis
  uniswap/     trading api client, calldata validation gate
  format/      price, usd, percent, compact, duration, address truncation
  risk/        deterministic checks, sell simulation
  pnl/         FIFO engine, shared by ranker and portfolio
  fees/        single fee config, see below
  supabase/    server client, browser client, realtime hooks
  validation/  zod schemas, one per endpoint, shared with the client
worker/
  index.ts     entry, subscription manager
  streams/     poolCreated.ts  swaps.ts  liquidity.ts
  universe.ts  which pools are tracked
  cursor.ts    durable resume
```

## Primitives, and why these ones

The whole visual identity comes from about ten components. Getting them right once is what
stops the product looking like a template.

**`<Value>`** renders every number in the product. Tabular monospace, fixed decimal places per
magnitude, and it reserves width so a price ticking from `0.00041` to `0.00039` does not shift
the row. Every price, size and percentage goes through it. Nothing formats a number inline.

**`<Delta>`** renders a change. Green up, red down, grey at zero, with the sign always shown.
It is the only component allowed to use the green and red tokens.

**`<Stat>`** is a label and a value in a fixed vertical rhythm. The token header is six of
these in a row, not six bespoke divs.

**`<Table>`** is a headless dense table with column alignment (text left, numbers right),
optional virtualisation past 100 rows, and a shared empty and loading state. Every list in the
product uses it. This is what stops Discover, Wallets and Portfolio drifting apart visually.

**`<Address>`** truncates, copies on click, and links to Blockscout. Addresses appear on six
screens and must behave identically on all of them.

**`<Chip>`** is the risk and label chip. Three states only.

**`<Sheet>`** is the mobile bottom sheet, and on desktop it is the only modal. Trade on mobile
is a sheet, signing confirmation is a sheet. One motion path, not five.

## State management

Deliberately three layers and no store library.

**Server state: TanStack Query.** Every read endpoint. Stale times match the cache TTLs in the
API spec, so the client and the server agree on freshness. Realtime pushes call
`queryClient.setQueryData` to patch a cached list rather than triggering a refetch, which is
what makes the launch feed feel instant instead of chatty.

**Chain state: wagmi.** Connection, address, balances, chain guard, transaction receipts.
Never mirrored into another store, because a mirrored wallet address is how you end up
signing from the wrong account.

**UI state: React state and URL.** Filters, selected timeframe, active tab and trade side all
live in the URL as search params, so a filtered Discover view or a loaded trade panel is
shareable and survives a refresh. Local component state for everything else.

The only global client state is the launch-feed filter object and the watchlist, both
persisted to `localStorage` and both small. No Redux, no Zustand, no context provider tree.

## Data flow, end to end

**A new token appears on Discover:**

```
Uniswap PoolManager.Initialize log
  -> worker WebSocket subscription
  -> normalise, resolve token metadata, sanitise strings
  -> insert into tokens, pools, token_launches
  -> Supabase Realtime broadcast on `launches`
  -> browser receives, applies active filters client-side
  -> prepend row with a 120ms fade, or increment the paused counter
```

Sub-second from chain to screen, with no polling anywhere in the path.

**A user buys:**

```
TradePanel debounces amount
  -> POST /api/trade/quote (server holds the Uniswap key)
  -> render output, impact, minimum received, fees
  -> user presses BUY
  -> ConnectGate: connect if needed, assert chainId 4663
  -> POST /api/trade/approval, sign if required
  -> POST /api/trade/swap, server runs the calldata validation gate
  -> wagmi sendTransaction, TxStatus enters CONFIRM IN WALLET
  -> POST /api/tx/track so state survives a refresh
  -> receipt -> CONFIRMED, invalidate balances and portfolio queries
```

**A wallet ranking refreshes:**

```
cron /api/cron/rank (12h)
  -> read swaps for the window over tracked pools
  -> FIFO engine rebuilds positions wholesale
  -> compute wallet_metrics per window
  -> z-score, shrink win rate, apply minimums and the self-trade filter
  -> write wallet_rankings with a new computed_at
  -> old ranking rows remain, so a ranking is never half-written
```

Writing a new `computed_at` generation rather than updating in place means readers always see
a complete, self-consistent ranking. That is worth the small amount of extra storage.

## Mobile

Not a shrunk desktop.

- Discover: the launch feed is the whole screen. Filters collapse into a single button that
  shows the active count. Trending and Movers become horizontally scrollable strips above it.
- Token page: header, then chart at 45% viewport height, then a sticky BUY / SELL bar pinned
  to the bottom safe area. The tabs scroll under it.
- Trade: a bottom sheet, thumb-reachable, with the amount pad above the fold.
- Wallets: the table drops to rank, address, ROI and win rate. Everything else moves to the
  profile.
- Tab bar is bottom-fixed on mobile and top-left on desktop.

Charts stay usable because `lightweight-charts` handles touch pan and pinch natively. We do
not build gesture handling.

## Required states, per surface

Every list and panel ships all of these before it counts as done:

`loading` (skeleton matched to final row height, never a spinner over a layout shift),
`empty` (says what would fill it), `error` (says what failed and offers retry),
`stale` (data older than its TTL, shown as a dot not a banner),
`disconnected` (wallet actions only), `wrong network`, `insufficient balance`,
`quote expired`, `tx pending`, `tx failed with reason`.

The rule from the brief holds: nothing renders a broken interface, and nothing shows a raw
stack trace.

## Fees

One module, `lib/fees/config.ts`, exporting a typed config read by both the server and the
review screens. No component computes a fee. No fee value is written anywhere else in the
codebase. Every fee that will be charged appears in the confirmation UI before a signature,
itemised in USD.
