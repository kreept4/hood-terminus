# Hackathon build plan

The release Hood Terminus submits to Colosseum's Crypto World's Fair. Deadline: October 12, 2026, 11:59 PM PT (October 13, 7:59 AM in Lagos).

Hood Terminus is the trading terminal for Robinhood Chain. Verify, a pre-trade sell simulation, is the headline feature. The launchpad is one part of the product, not the pitch. Everything below serves that positioning, and every claim the product makes must be true against the code and the contracts.

## Decisions already made

| # | Decision |
| --- | --- |
| 1 | Repo history is rewritten so "Import v1" is the first commit (Phase 0). |
| 2 | The homepage is the terminal: live data on the first screen, no marketing hero. |
| 3 | A Danger or Unknown verdict requires a "Buy anyway" confirm before a buy is signed. It never blocks. |
| 4 | Every token page gets a trade panel, and trading supports Uniswap v4 pools quoted in ETH. Every transaction is simulated before the wallet opens. |
| 5 | Launchpad V3: creators keep earning after graduation, and the creator share is 80% of the 1% trading fee. |
| 6 | Terminal fee: 0.5% on swaps routed through Uniswap. No terminal fee on bonding-curve trades, and none on tokens launched through Hood Terminus. |
| 7 | Background alerts are delivered by browser push. Supabase pg_cron with pg_net is the scheduler and calls app routes. |
| 8 | Public URL stays hood-terminus.vercel.app. |
| 9 | Nothing reaches production until the cloud Claude session has reviewed it and the owner has approved. |

## Rules

### Workflow

1. Work in a fresh clone named `hood-terminus-build`, next to the old project folder. Never edit the old folder.
2. After Phase 0, all work happens on branch `hackathon-build`. Never push to `main` after Phase 0.
3. Commit after each numbered task with a clear message. Push at the end of every phase.
4. Append one entry per phase to `docs/build-log.md`: date, phase, what changed, what was tested. The README's hackathon list is built from it.
5. Never run `vercel --prod` or `vercel promote`. Never send a mainnet transaction before the final checkpoint.
6. Ask the owner before anything this plan does not cover, anything that spends money, or anything that cannot be undone.

### Engineering

1. Read `AGENTS.md` first. This is Next.js 16: read the relevant guide in `node_modules/next/dist/docs/` before using any Next.js API.
2. TypeScript strict, no `any`. Validate every API input with zod (already a dependency). Every API route gets rate limiting from `lib/rate-limit.ts`, explicit JSON errors, and cache headers.
3. Server-only modules keep `import "server-only"`. Secrets never reach the client bundle.
4. New dependencies allowed: `vitest`, `solc@0.8.26`, `web-push` with its types, `@vercel/analytics`. Ask before adding anything else.
5. Secrets never go into code, commits, logs or chat. New secrets go into `.env.local` and into Vercel with `vercel env add` for production and preview.
6. Do not edit `contracts/contracts/HoodLaunchpad.sol` or `HoodLaunchpadV2.sol`.
7. Verify's invariant: a check that could not run reports unknown, never pass. Keep it.
8. Keep the codebase's comment style: short notes on why, not what.

### Design

1. Use the existing design tokens and primitives. Dark only. No gradients, no new decorative animation.
2. Typography-led, dense but calm, in the spirit of Linear and Vercel. Every element earns its place.
3. Every state is designed and honest: loading skeletons at final size, empty, error, unknown.
4. Numbers use tabular figures. Addresses are shortened with copy buttons.
5. Mobile at 390 px is first-class: no horizontal scroll, touch targets at least 40 px.
6. Keyboard accessible with visible focus, and WCAG AA contrast.

### Copy

1. Plain, specific English. No em dashes. No hype words (seamless, revolutionary, empower, unlock).
2. Every claim is true against the code and the contract. Figures that can change (launch fee, creator share) are read live from the chain, not hardcoded.

## Phase 0: setup and history

The repo's `main` currently holds the license and Verify commits; branch `v1-import` holds v1. This phase makes v1 the first commit.

1. `git clone https://github.com/kreept4/hood-terminus hood-terminus-build`, then `cd hood-terminus-build && git fetch origin`.
2. Save the plan for later: `git show origin/build-plan:docs/13-hackathon-build-plan.md > ../hackathon-build-plan.md`.
3. `git checkout -b rebuild origin/v1-import`.
4. Remove build output from the import commit: `git rm -r --cached contracts/artifacts tsconfig.tsbuildinfo _file-dates.txt design/__pycache__`, delete those paths, then `git commit --amend --no-edit`. Keep a copy of `_file-dates.txt` outside the repo first.
5. `git cherry-pick 9ff466f6e8e6a3ff9f0503d29dcf8b6b4e439f91`. On the `.gitignore` conflict, take the incoming version (`git checkout --theirs .gitignore`), add `__pycache__/`, stage it, and continue.
6. `git cherry-pick 54b1650b6e575c565c665dea974256c44f6c8336`. On the `README.md` conflict, take the incoming version. Then replace the paragraph that begins "Version 1 was built between" with exactly:

   > Version 1 was built between September 3 and September 11, 2026, before the hackathon began, and shipped to production at 10:21 UTC on September 11. The first commit in this repository, "Import v1", is that project as it stood: every file in it was last modified between September 3 and September 11. Only the compiled contract output was left out, as build output. Everything committed after it was built during the hackathon and is listed below.

   Stage it and continue.
7. Check: `git log --oneline` shows exactly three commits, oldest first: "Import v1...", "Add MIT license and .gitignore", "Add Verify...". `contracts/artifacts` is absent.
8. Show the owner the log and ask for a yes. Then: `git push --force-with-lease=main:54b1650b6e575c565c665dea974256c44f6c8336 origin rebuild:main`, followed by `git push origin --delete v1-import build-plan`.
9. `git checkout -b hackathon-build origin/main`. Copy the saved plan to `docs/13-hackathon-build-plan.md`, create `docs/build-log.md`, and commit both.
10. Copy `.env.local` from the old folder. `npm ci`, then `npm run dev`. Confirm the site runs locally exactly as production does.

## Phase 1: foundations

1. Add `vitest`. Add scripts: `test` (vitest run), `typecheck` (tsc --noEmit), `build:verify-sim` (node scripts/build-verify-sim.mjs). Add `solc@0.8.26` as a dev dependency. Running `build:verify-sim` must regenerate `lib/verify/sim-artifact.ts` byte for byte.
2. Add `.github/workflows/ci.yml`, running on every push and pull request:
   - Job one: `npm ci`, lint, typecheck, test, and `next build` with placeholder public env values.
   - Job two: `cd contracts && npm ci && npx hardhat test`.
3. Add an amber ramp to `design/tokens.py` (OKLCH, with the same WCAG contrast assertions as the other ramps) and regenerate `app/tokens.css`. Fix `Chip`'s `unknown` tone, which currently uses the green pass classes. Switch `components/verify/tone.ts` to the new token classes and remove its literal fallback.
4. In `lib/verify/client.ts`, use `CONTRACTS.weth` from `lib/chain/contracts.ts` instead of the local constant.
5. `/api/verify/[address]`: rate limit 30 requests per minute per IP. Add CORS (GET and OPTIONS, `Access-Control-Allow-Origin: *`) for `/api/verify/*` only. Update the comment in `next.config.ts` that says the API is same-origin only.

Acceptance: CI is green on push.

## Phase 2: launchpad V3 (no mainnet deploy in this phase)

Why: V2 pays fees only while a token is on the curve. After graduation, the Uniswap position's fees accumulate and nothing can collect them, so creators stop earning at 4 ETH. Pons keeps paying creators after graduation.

1. Create `contracts/contracts/HoodLaunchpadV3.sol` from V2 with the smallest possible diff:
   - `creatorShareBps` starts at 8000.
   - Add `collectPoolFees(address token) returns (uint256 amount0, uint256 amount1)`. It is permissionless and `nonReentrant`. It requires the token to be graduated and its pool finalised. It pokes the position with `burn` of zero liquidity, then collects all owed fees from the v3 pool to the contract. It splits each asset by `creatorShareBps`: the creator side goes to the launch's fee recipient, the remainder to the owner, both through the existing `feesOwed` accounting, so the existing withdraw functions pay them out. Rounding dust goes to the platform.
   - No function may burn non-zero liquidity, transfer the position, or otherwise remove liquidity. The liquidity stays locked forever.
   - Emit `PoolFeesCollected(token, amount0, amount1, creatorShareBps)`.
   - Document the diff from V2 in the file header.
2. `contracts/test/HoodLaunchpadV3.t.sol`: port the V2 tests, then add:
   - Graduation, swaps on the pool in both directions, then collect: the creator gets exactly 80% and the platform 20%.
   - Pool liquidity is unchanged after collect.
   - A second collect returns zero.
   - Any address can call collect.
   - `setCreatorShare` bounds of 5000 to 10000.
   - Reentrancy.
   - A USDG-quoted graduation.
3. `contracts/scripts/rehearse-v3.ts`, modelled on `rehearse-v2.ts`, against a fork of Robinhood Chain mainnet: deploy, set quotes matching V2's live configuration (read it from V2 onchain), launch, buy to graduation, finalise, swap on the pool, collect, withdraw. Print every balance.
4. `contracts/scripts/deploy-v3.ts` and a `deploy:v3` script. Do not run them in this phase. Post-deploy steps: set quotes as above, verify the source on Blockscout (`https://robinhoodchain.blockscout.com/api`), print the address.
5. `docs/14-launchpad-v3.md`: why V3 exists, the diff, fee math with a worked example, and what cannot happen (liquidity is locked forever, and the creator share can never go below 50%).

Acceptance: `npx hardhat test` is all green, the rehearsal shows the correct split, and no mainnet transaction was sent.

## Phase 3: trading on every token page, including Uniswap v4

1. `lib/trade/router.ts`: add v4 buys and sells through `CONTRACTS.universalRouter` using the `V4_SWAP` command with the actions `SWAP_EXACT_IN_SINGLE`, `SETTLE_ALL` and `TAKE` or `TAKE_ALL`. Pool keys come from `v4PoolKey` in `lib/verify/pool.ts`. Confirm the command and action codes against the v4-periphery and UniversalRouter sources for the deployed router, and prove them with an `eth_call` simulation against mainnet before building UI on them.
2. Terminal fee in `lib/trade/fees.ts`: `TERMINAL_FEE_BPS = 50` and `TERMINAL_FEE_RECIPIENT` (the launchpad owner address; ask the owner to confirm it).
   - Buys: the fee comes out of the ETH input in the same transaction, sent to the recipient before the swap.
   - Sells: the output lands in the router, the fee goes out with `PAY_PORTION`, and the rest goes to the user with `SWEEP` and a minimum amount.
   - Apply the same to the existing v3 path.
   - Skip the fee for curve trades and for any token the V2 or V3 launchpad launched.
3. Quotes for v4 use the Verify simulator's buy and sell legs, which include hook fees exactly. Extend `/api/quote` with a v4 mode. Before signing, the panel shows: you receive, minimum received, price impact, route (for example "Uniswap v4 · Pons hook"), and the Hood Terminus fee.
4. Pre-flight: before every send, simulate the exact transaction from the user's address. If it would revert, show the decoded reason and do not open the wallet.
5. Token page (`app/t/[address]`): add a trade panel beside the chart on desktop and below the price on mobile, for v3 routable pools and v4 pools quoted in native ETH or WETH.
   - Pools priced in USDG or stock tokens: say plainly that trading them isn't supported yet, and link the token's ETH market if one exists.
   - Curve tokens keep `CurvePanel`.
6. `/trade`: include tradable v4 ETH pools.
7. Tests: unit tests for v3 and v4 calldata encoding and the fee math. Add `scripts/sim-trade.mjs`, which simulates a buy through the router on mainnet with state overrides for one v3 pool, one v4 pool without a hook, one Pons pool and one Bankr ETH pool, and asserts both success and the fee transfer.

Acceptance: every test and simulation passes. Sells are proven at the final checkpoint by the owner doing a real round trip of about $1 on a v3 token and a v4 token.

## Phase 4: Verify everywhere

1. Token page: `VerifyPanel` for the base token, and `VerifyBadge` in the trade panel. On a Danger or Unknown verdict, a confirm dialog shows the headline and the failing checks, with "Buy anyway" and "Cancel".
2. New `/verify` page: a paste box that validates the address, `VerifyPanel` for `?token=`, the last 5 checks stored in this browser, and a copyable share link.
3. Curve tokens: add a curve kind to `contracts/verify/VerifySim.sol` that buys and then sells against the Hood Terminus launchpad, then regenerate the artifact. The report says the token trades on the Hood Terminus bonding curve. Add a unit test and a live simulation.
4. Verdict store: a Supabase table `token_verdicts` (token as primary key, verdict, headline, report as jsonb, checked_at). Public read, service-role write, with RLS.
   - Every completed Verify report is upserted into it.
   - New route `POST /api/cron/verify-board`, authorised by `Bearer CRON_SECRET`: it verifies up to 12 board tokens per run that lack a verdict newer than 10 minutes, three at a time, using the same pool lists as the homepage.
5. Board column: `PoolTable` gets a Verify column, filled from `token_verdicts` in one query during the page's server render, run in parallel with the pool fetches. Tokens without a verdict show a "Check" chip linking to `/verify?token=`. If the query fails, the column hides; the board never breaks.

## Phase 5: homepage, navigation and copy

1. Homepage (`app/page.tsx`):
   - Remove `Hero`, `CreatePitch`, `SmoothScroll`, `PageField`, and the parallax and pixel-reveal effects.
   - Top: one compact line, "The trading terminal for Robinhood Chain", beside a large input, "Paste a token or search a ticker". A 40-hex-character address goes to `/verify?token=`; anything else uses the existing `q` search.
   - `ChainStats` directly below.
   - The token board with its Verify column, visible on the first screen at 1440x900 and 390x844.
   - Desktop right rail: "Top wallets this week", the top 5 with profit and win rate, linking to `/wallets`.
2. Move `CreatePitch` to the top of `/create`. Its mockup URL shows `hood-terminus.vercel.app`. The visual effects may stay there.
3. Navigation (`components/shell/Sidebar.tsx` and `Dock.tsx`):
   - The permanent accent button becomes "Verify a token", linking to `/verify`. In the mobile dock, Verify takes the accented centre slot.
   - Order: Tokens, Verify, Wallets, Trade, Portfolio, Alerts, Launch.
   - "Create" is renamed "Launch".
4. Truth sweep, checking every claim against the contract:
   - "Creators earn 80% of the 1% trading fee, on the curve and after graduation". The second half shows only once V3 is the active launchpad, controlled by `NEXT_PUBLIC_LAUNCHPAD_VERSION`.
   - The launch fee is read live from `launchFee()`. Replace "nothing up front" with "No liquidity needed".
   - The optional creator tax (up to 9%) applies only while on the curve.
   - `BRAND.description`: "Check a token before you buy, track the wallets that are winning, and trade on Robinhood Chain."
   - Each page gets its own metadata title.

## Phase 6: background alerts by browser push

1. Add `public/sw.js`. It receives pushes and opens the token page on click. Registration happens only when the user enables background alerts.
2. On the Alerts page, add "Notify me when Hood Terminus is closed". It requests notification permission, subscribes with the VAPID public key, and syncs the browser's rules to the server. Include a note: on iPhone this works once the app is added to the Home Screen.
3. Supabase migration: `push_subscriptions` (an unguessable id kept in localStorage, endpoint, keys) and `alert_rules` (subscription, pool, symbol, metric, value, armed, last_fired_at). RLS is service-role only. Routes `POST /api/alerts/subscribe`, `PUT /api/alerts/rules` and `DELETE /api/alerts/subscription`, each rate limited.
4. `POST /api/cron/alerts`, authorised by `Bearer CRON_SECRET`:
   - Loads the rules and fetches each unique pool once.
   - Fires with hysteresis: a rule fires once when its condition becomes true and re-arms when it is false again.
   - Sends with `web-push` and deletes subscriptions the push service reports as gone.
   - Rule evaluation is a pure function with unit tests.
5. Generate VAPID keys locally with `npx web-push generate-vapid-keys`. Add `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` to `.env.local` and to Vercel for production and preview.
6. Write the pg_cron and pg_net schedule as its own migration file, `supabase/migrations/0099_schedules.sql`:
   - `/api/cron/alerts` every minute.
   - `/api/cron/verify-board` every 2 minutes.
   - Both use `CRON_SECRET` from Supabase Vault.
   - Do not apply this file before the final checkpoint.
   - Apply the other migrations with the Supabase CLI (`npx supabase login`, `link`, `db push`). If CLI login isn't possible, print the SQL for the owner to run in the Supabase SQL editor.

## Phase 7: public API, analytics, docs

1. New `/developers` page covering the Verify API: the endpoint, response schema (`VerifyReport`), example `curl` and `fetch` calls, 30 requests per minute, CORS, caching, and "Free while in beta. Higher limits on request."
2. Add `@vercel/analytics` (`<Analytics />` in `app/layout.tsx`). Tell the owner to switch Analytics on in the Vercel dashboard.
3. README: update the features table (v4 trading, terminal fee, alerts, Verify API, launchpad V3) and the "Built during Crypto World's Fair" list, generated from `docs/build-log.md`. Add screenshots to `docs/screens/` using `scripts/shoot.mjs` and link them.

## Phase 8: quality pass, then the final checkpoint

1. Check every page at 1440x900, 1280x800 and 390x844 against the Design rules: no layout shift, no horizontal scroll, keyboard and focus, designed states, and contrast.
2. Lint, typecheck, unit tests, contract tests, simulations, and `next build` all pass.
3. Push `hackathon-build`, then STOP and report:
   - What changed, by phase.
   - Test and simulation results.
   - Screenshot paths.
   - Anything unfinished or uncertain.
   - The exact steps for the final release below.

## Final release (only after the cloud review and the owner's go)

1. Deploy V3 with `deploy:v3`. Verify it on Blockscout, set quotes, confirm `creatorShareBps` is 8000, transfer ownership if the owner asks, and record the address in `docs/14-launchpad-v3.md`.
2. Set `NEXT_PUBLIC_LAUNCHPAD_ADDRESS` to V3 and `NEXT_PUBLIC_LAUNCHPAD_VERSION=3` in Vercel for production and preview.
3. Apply `0099_schedules.sql`.
4. Deploy a preview with `vercel deploy` (not `--prod`) and share the URL. The owner does the $1 round trips; the cloud session verifies.
5. Merge `hackathon-build` into `main` and promote only when the owner says so.
