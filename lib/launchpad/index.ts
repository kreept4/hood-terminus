import type { Address } from "viem";

/**
 * The launchpad, as the app sees it.
 *
 * The address comes from the environment because the contract is deployed
 * separately, per network, and hardcoding one here would mean a rebuild every
 * time it moves. Unset means not deployed, and the create form says exactly
 * that rather than opening a wallet against address zero.
 */
export const LAUNCHPAD_ADDRESS = (process.env
  .NEXT_PUBLIC_LAUNCHPAD_ADDRESS ?? "") as Address | "";

export function isLaunchpadDeployed(): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(LAUNCHPAD_ADDRESS);
}

/**
 * Only what the app calls.
 *
 * A trimmed ABI rather than the compiler's full output: it is smaller in the
 * bundle, and it makes the surface the frontend touches explicit. Anything not
 * listed here is something the UI cannot do by accident.
 */
export const LAUNCHPAD_ABI = [
  {
    name: "launch",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "feeRecipient", type: "address" },
      { name: "quote", type: "address" },
      { name: "creatorTaxBps", type: "uint16" },
    ],
    outputs: [{ name: "token", type: "address" }],
  },
  /**
   * Owner-only, and read by the owner panel to decide whether to render at all.
   * `setLaunchFee` is the only one of these the app ever calls; the others stay
   * on the command line where a mistake is deliberate.
   */
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "setLaunchFee",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "next", type: "uint256" }],
    outputs: [],
  },
  {
    name: "launchFee",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  /**
   * The creator's cut of the trade fee, in basis points of the fee.
   *
   * Read rather than hardcoded because the owner can move it. The create page
   * quotes this number back to somebody deciding whether to launch, and a
   * figure that is wrong in the creator's favour is the worst kind of stale.
   */
  {
    name: "creatorShareBps",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint16" }],
  },
  {
    name: "quoteBuy",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "feesOwed",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "asset", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "withdrawFees",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [],
  },
  {
    name: "buy",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "token", type: "address" },
      { name: "minTokensOut", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "sell",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "tokensIn", type: "uint256" },
      { name: "minEthOut", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "quoteSell",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "tokensIn", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "tokenCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "allTokens",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    name: "launches",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [
      { name: "creator", type: "address" },
      { name: "quote", type: "address" },
      { name: "quoteReserve", type: "uint128" },
      { name: "tokenReserve", type: "uint128" },
      { name: "creatorTaxBps", type: "uint16" },
      { name: "graduated", type: "bool" },
    ],
  },
  {
    /** Buying a token paired against an ERC20 rather than native ETH. */
    name: "buyWithQuote",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "minTokensOut", type: "uint256" },
    ],
    outputs: [],
  },
  {
    /** What an asset may be paired on, and whether it may be paired at all. */
    name: "quotes",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      { name: "allowed", type: "bool" },
      { name: "virtualReserve", type: "uint128" },
      { name: "graduation", type: "uint128" },
    ],
  },
  {
    name: "setQuote",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "allowed", type: "bool" },
      { name: "virtualReserve", type: "uint128" },
      { name: "graduation", type: "uint128" },
    ],
    outputs: [],
  },
  {
    name: "MAX_CREATOR_TAX_BPS",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint16" }],
  },
  {
    name: "progressBps",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "graduatedPool",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "address" }],
  },
  {
    /**
     * Opens the Uniswap market for a graduated token.
     *
     * Deliberately callable by anyone. Building the pool costs about five
     * million gas, which is why it is not bolted onto whichever trade happens
     * to fill the curve: that would bill one arbitrary buyer for a market
     * everyone uses. Every parameter is already fixed by the time this is
     * callable, so the only thing a caller contributes is the gas.
     */
    name: "finalisePool",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "token", type: "address" }],
    outputs: [],
  },
  {
    name: "Graduated",
    type: "event",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "ethReserve", type: "uint256", indexed: false },
      { name: "tokens", type: "uint256", indexed: false },
    ],
  },
  {
    name: "PoolCreated",
    type: "event",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "pool", type: "address", indexed: true },
      { name: "ethSeeded", type: "uint256", indexed: false },
      { name: "tokensSeeded", type: "uint256", indexed: false },
    ],
  },
  {
    name: "Launched",
    type: "event",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
    ],
  },
] as const;


/**
 * A `launches(token)` row, read by name rather than by position.
 *
 * The struct gained a quote asset and a creator tax between versions, which
 * moved every field after the first. Positional reads were silently wrong
 * afterwards: `record[1]` went from being the reserve to being an address, and
 * nothing complained until a number rendered as `NaN`. Naming them means the
 * next field costs a compile error rather than a wrong figure on screen.
 */
export type LaunchTuple = readonly [
  creator: `0x${string}`,
  quote: `0x${string}`,
  quoteReserve: bigint,
  tokenReserve: bigint,
  creatorTaxBps: number,
  graduated: boolean,
];

export type LaunchRecord = {
  creator: `0x${string}`;
  quote: `0x${string}`;
  quoteReserve: bigint;
  tokenReserve: bigint;
  creatorTaxBps: number;
  graduated: boolean;
};

export function toLaunchRecord(tuple: LaunchTuple): LaunchRecord {
  return {
    creator: tuple[0],
    quote: tuple[1],
    quoteReserve: tuple[2],
    tokenReserve: tuple[3],
    creatorTaxBps: tuple[4],
    graduated: tuple[5],
  };
}
