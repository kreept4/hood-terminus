import type { Address, PublicClient } from "viem";
import {
  LAUNCHPAD_ABI,
  LAUNCHPAD_ADDRESS,
  isLaunchpadDeployed,
  toLaunchRecord,
  type LaunchTuple,
} from "./index";
import { quoteAsset } from "./quotes";

/**
 * Everything a creator's token has done, read straight off the launchpad.
 *
 * There is no database behind this and there should not be. The launchpad is
 * already the record: it knows who created every token, what the curve holds,
 * whether it graduated and which pool it graduated into. A table mirroring
 * that would be a second source of truth that can disagree with the first, and
 * when they disagree the chain is right.
 *
 * The cost is that this walks every launch to find one wallet's. That is fine
 * at the scale a launchpad reaches before it can afford an indexer, and the
 * reads are batched into one round trip per stage rather than one per token.
 */

/**
 * There is deliberately no graduation constant here any more.
 *
 * There was one, fixed at four ether, and it was read by the token page, the
 * creator's own list, the create form and the terms. Once a curve could be
 * paired against a stock or a stablecoin every one of those readings was wrong:
 * an NVDA token showed eleven times the progress it had, and a USDG token, six
 * decimals against eighteen, showed a four thousand dollar curve as four
 * billionths of one. The threshold belongs to the paired asset, so it lives on
 * `quoteAsset(quote).graduation` and the contract is the authority.
 */

export type CreatedToken = {
  address: Address;
  name: string;
  symbol: string;
  /**
   * What the curve has taken in, in the units of whatever it is paired against.
   *
   * Named for ETH because that was the only pairing when it was written. It is
   * NVDA on an NVDA-paired token and USDG on a USDG-paired one, so read it with
   * `quote` beside it and never assume the denomination.
   */
  raisedEth: number;
  /** What it is paired against. Decides the units of everything above. */
  quote: Address;
  /** The threshold it is measured against, in that same asset. */
  graduation: number;
  /** Tokens the curve still holds, of the 800M it started with. */
  tokensLeft: number;
  /** How far along the curve is, 0 to 1. Clamped, because it can overshoot. */
  progress: number;
  graduated: boolean;
  /** The Uniswap pool, once the market has been opened. */
  pool: Address | null;
  /**
   * Graduated but with no pool yet.
   *
   * Opening the market is a separate transaction on purpose, so this state is
   * expected rather than a fault, and it is the one state that needs someone
   * to act.
   */
  awaitingMarket: boolean;
};

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * The Launch struct, flattened the way a public mapping getter returns it.
 *
 * Declared once in `./index` now. It was written out here as well, which meant
 * the struct gaining two fields left this copy quietly describing a shape the
 * chain had stopped returning.
 */
type LaunchRecord = LaunchTuple;

const ERC20_ABI = [
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

/**
 * The tokens one wallet created.
 *
 * Reads in three batched stages: the addresses, then the launch records to
 * find this wallet's, then names and symbols for only those. Filtering before
 * the metadata stage is the point; a creator with two tokens should not pay
 * for two hundred names.
 */
export async function getCreatedTokens(
  client: PublicClient,
  creator: Address,
): Promise<CreatedToken[]> {
  if (!isLaunchpadDeployed()) return [];

  const pad = { address: LAUNCHPAD_ADDRESS as Address, abi: LAUNCHPAD_ABI } as const;
  const wanted = creator.toLowerCase();

  const count = Number(
    await client.readContract({ ...pad, functionName: "tokenCount" }),
  );
  if (count === 0) return [];

  const addresses = (await client.multicall({
    contracts: Array.from({ length: count }, (_, i) => ({
      ...pad,
      functionName: "allTokens" as const,
      args: [BigInt(i)] as const,
    })),
    allowFailure: false,
  })) as Address[];

  const records = (await client.multicall({
    contracts: addresses.map((address) => ({
      ...pad,
      functionName: "launches" as const,
      args: [address] as const,
    })),
    allowFailure: false,
  })) as readonly LaunchRecord[];

  const mine: { address: Address; record: LaunchRecord }[] = [];
  addresses.forEach((address, i) => {
    if (records[i][0].toLowerCase() === wanted) mine.push({ address, record: records[i] });
  });
  if (mine.length === 0) return [];

  const meta = await client.multicall({
    contracts: mine.flatMap(({ address }) => [
      { address, abi: ERC20_ABI, functionName: "name" as const },
      { address, abi: ERC20_ABI, functionName: "symbol" as const },
    ]),
    allowFailure: true,
  });

  /**
   * Tolerant of a launchpad that predates graduation.
   *
   * An older deployment has no `graduatedPool`, and a strict multicall would
   * take the whole panel down over it rather than the one column it feeds. A
   * failed read here means the same thing as a zero address does: no market
   * yet. So it degrades to that instead of throwing.
   */
  const poolResults = await client.multicall({
    contracts: mine.map(({ address }) => ({
      ...pad,
      functionName: "graduatedPool" as const,
      args: [address] as const,
    })),
    allowFailure: true,
  });
  const pools = poolResults.map((r) =>
    r.status === "success" ? (r.result as Address) : (ZERO as Address),
  );

  return mine.map(({ address, record }, i) => {
    // Destructured by name. Positionally this read the quote address as a
    // reserve and a tax as a boolean once the struct grew.
    const { quote, quoteReserve, tokenReserve, graduated } = toLaunchRecord(record);
    // In the pairing's own units, not in ether. USDG has six decimals, so
    // dividing by 1e18 read a four thousand dollar curve as four billionths.
    const asset = quoteAsset(quote);
    const raisedEth = Number(quoteReserve) / 10 ** asset.decimals;
    const pool = pools[i] && pools[i] !== ZERO ? pools[i] : null;

    const nameResult = meta[i * 2];
    const symbolResult = meta[i * 2 + 1];

    return {
      address,
      name: nameResult?.status === "success" ? (nameResult.result as string) : "Unknown",
      symbol: symbolResult?.status === "success" ? (symbolResult.result as string) : "?",
      raisedEth,
      quote,
      graduation: asset.graduation,
      tokensLeft: Number(tokenReserve) / 1e18,
      // Clamped because the buy that graduates a token overshoots the
      // threshold, and a progress bar past 100 percent reads as a bug.
      progress: Math.min(raisedEth / asset.graduation, 1),
      graduated,
      pool,
      awaitingMarket: graduated && pool === null,
    };
  });
}

/** Fees a creator has earned and not yet withdrawn, in ETH. */
export async function getFeesOwed(
  client: PublicClient,
  account: Address,
): Promise<number> {
  if (!isLaunchpadDeployed()) return 0;
  const owed = await client.readContract({
    address: LAUNCHPAD_ADDRESS as Address,
    abi: LAUNCHPAD_ABI,
    functionName: "feesOwed",
    // Native. A creator owed in another asset claims it where that asset is
    // named, rather than having two balances added into one meaningless total.
    args: [account, ZERO as Address],
  });
  return Number(owed) / 1e18;
}
