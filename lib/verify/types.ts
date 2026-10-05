import type { Address } from "viem";

/**
 * Verify's report, as the API returns it and the panel renders it.
 *
 * Every check resolves to one of four states, and "unknown" is a real answer:
 * it means the check could not run, never that it quietly passed. A report
 * with an unknown sell test is not a clean report, whatever else it says.
 */

export type CheckStatus = "pass" | "warn" | "fail" | "unknown";

export type Verdict = "clear" | "caution" | "danger" | "unknown";

export type CheckId =
  | "sell"
  | "tax"
  | "flagged"
  | "owner"
  | "upgrade"
  | "hook"
  | "holders"
  | "developer"
  | "liquidity"
  | "activity"
  | "age";

export type Check = {
  id: CheckId;
  label: string;
  status: CheckStatus;
  detail: string;
};

export type PoolKind = "v2" | "v3" | "v4" | "other";

export type VerifiedPool = {
  /** v2 pair or v3 pool address, or the v4 pool id. */
  id: string;
  kind: PoolKind;
  /** GeckoTerminal's dex id, which also names the launchpad for hooked pools. */
  dex: string;
  name: string;
  quoteSymbol: string;
  liquidityUsd: number | null;
  createdAt: string | null;
  /** v4 only. Zero address when the pool has no hook. */
  hooks: Address | null;
};

export type SimulationSummary = {
  /** Size of the simulated buy, in dollars. Null for a sell-only run. */
  tradeUsd: number | null;
  /** Lost on an immediate buy and sell back: pool fees, hook fees, taxes and price impact together. */
  roundTripPct: number | null;
  /** Taken by the token itself on the way in. */
  buyTaxPct: number | null;
  /** Taken by the token itself on the way out. */
  sellTaxPct: number | null;
  sellBlocked: boolean;
  /** True when only the sell could be simulated, because the quote asset could not be funded. */
  sellOnly: boolean;
};

export type VerifyReport = {
  token: Address;
  chainId: number;
  checkedAt: string;
  name: string | null;
  symbol: string | null;
  verdict: Verdict;
  /** One sentence a trader can act on. */
  headline: string;
  pool: VerifiedPool | null;
  simulation: SimulationSummary | null;
  checks: Check[];
};
