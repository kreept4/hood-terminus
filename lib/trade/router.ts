import { encodeAbiParameters, concat, numberToHex, type Address, type Hex } from "viem";
import { CONTRACTS } from "@/lib/chain/contracts";

/**
 * Calldata for Uniswap's UniversalRouter.
 *
 * The router takes a string of one-byte commands and a matching array of
 * encoded inputs, then runs them in order. That is what makes wrapping ETH and
 * swapping it a single transaction and a single signature.
 *
 * ── Why this avoids Permit2 for buys ───────────────────────────────────────
 *
 * Selling a token needs Permit2: the router has to pull an ERC-20 from the
 * user, which is two approvals before the first swap ever happens.
 *
 * Buying with ETH needs none of it. WRAP_ETH turns the transaction's own value
 * into WETH held by the router, and the swap then spends the router's own
 * balance rather than the user's. One transaction, one signature, no approval.
 * It is worth structuring the buy path around, because the first thing a new
 * user does is buy, and an approval prompt before their first trade is the
 * single worst place to add friction.
 */

/** UniversalRouter command bytes. */
const CMD = {
  V3_SWAP_EXACT_IN: 0x00,
  WRAP_ETH: 0x0b,
  UNWRAP_WETH: 0x0c,
} as const;

/**
 * The router's two sentinel recipients.
 *
 * Real addresses would be indistinguishable from a user's, so the router
 * reserves 1 and 2 to mean "whoever sent this" and "the router itself".
 */
const MSG_SENDER = "0x0000000000000000000000000000000000000001" as Address;
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002" as Address;

/**
 * A V3 path: token, fee, token. Packed, not ABI-encoded.
 *
 * The fee is three bytes rather than the four a uint24 would normally occupy in
 * calldata. Encoding it any other way produces a path the pool cannot parse and
 * a revert with no useful message.
 */
export function encodePath(tokenIn: Address, fee: number, tokenOut: Address): Hex {
  return concat([
    tokenIn,
    numberToHex(fee, { size: 3 }),
    tokenOut,
  ]);
}

const SWAP_INPUT = [
  { type: "address" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "bytes" },
  { type: "bool" },
] as const;

const TRANSFER_INPUT = [{ type: "address" }, { type: "uint256" }] as const;

export type RouterCall = {
  to: Address;
  value: bigint;
  commands: Hex;
  inputs: Hex[];
  deadline: bigint;
};

/**
 * Buy a token with the chain's native ETH.
 *
 * WRAP_ETH into the router, then swap the router's WETH and send the output
 * straight to the user. `payerIsUser` is false because by that point the router
 * is paying with its own balance.
 */
export function buildBuy({
  token,
  fee,
  amountIn,
  minAmountOut,
  deadlineSeconds = 600,
}: {
  token: Address;
  fee: number;
  amountIn: bigint;
  minAmountOut: bigint;
  deadlineSeconds?: number;
}): RouterCall {
  const weth = CONTRACTS.weth as Address;

  const commands = concat([
    numberToHex(CMD.WRAP_ETH, { size: 1 }),
    numberToHex(CMD.V3_SWAP_EXACT_IN, { size: 1 }),
  ]);

  const inputs: Hex[] = [
    encodeAbiParameters(TRANSFER_INPUT, [ADDRESS_THIS, amountIn]),
    encodeAbiParameters(SWAP_INPUT, [
      MSG_SENDER,
      amountIn,
      minAmountOut,
      encodePath(weth, fee, token),
      false,
    ]),
  ];

  return {
    to: CONTRACTS.universalRouter as Address,
    value: amountIn,
    commands,
    inputs,
    deadline: BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds),
  };
}

/**
 * Sell a token back to native ETH.
 *
 * Swap into the router, then UNWRAP_WETH to the user. `payerIsUser` is true
 * here, which is what makes this the path that needs a Permit2 allowance in
 * place first.
 */
export function buildSell({
  token,
  fee,
  amountIn,
  minAmountOut,
  deadlineSeconds = 600,
}: {
  token: Address;
  fee: number;
  amountIn: bigint;
  minAmountOut: bigint;
  deadlineSeconds?: number;
}): RouterCall {
  const weth = CONTRACTS.weth as Address;

  const commands = concat([
    numberToHex(CMD.V3_SWAP_EXACT_IN, { size: 1 }),
    numberToHex(CMD.UNWRAP_WETH, { size: 1 }),
  ]);

  const inputs: Hex[] = [
    encodeAbiParameters(SWAP_INPUT, [
      ADDRESS_THIS,
      amountIn,
      minAmountOut,
      encodePath(token, fee, weth),
      true,
    ]),
    encodeAbiParameters(TRANSFER_INPUT, [MSG_SENDER, minAmountOut]),
  ];

  return {
    to: CONTRACTS.universalRouter as Address,
    value: 0n,
    commands,
    inputs,
    deadline: BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds),
  };
}

/**
 * The floor the trade is allowed to settle at.
 *
 * This is the number that actually protects the trader, not the quote. The
 * quote is computed off pool state and assumes the swap stays inside the
 * current tick range; this bound is enforced on chain and cannot be wrong. A
 * quote that was too optimistic makes the swap revert. It can never make
 * someone receive less than they accepted.
 */
export function applySlippage(amountOut: bigint, slippagePct: number): bigint {
  const bps = BigInt(Math.round(slippagePct * 100));
  return (amountOut * (10_000n - bps)) / 10_000n;
}

export const UNIVERSAL_ROUTER_ABI = [
  {
    name: "execute",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

/** Permit2's approve, which is what a sell needs before the router can pull. */
export const PERMIT2_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    outputs: [],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
  },
] as const;
