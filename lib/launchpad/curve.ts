import "server-only";
import { createPublicClient, http, type Address } from "viem";
import { robinhoodChain } from "@/lib/chain";
import { getLaunchpadArtwork } from "@/lib/launchpad/artwork";
import {
  LAUNCHPAD_ABI,
  LAUNCHPAD_ADDRESS,
  isLaunchpadDeployed,
  toLaunchRecord,
  type LaunchTuple,
} from "./index";

import { quoteAsset } from "./quotes";

/**
 * Every token still on its bonding curve.
 *
 * This exists because of a gap that would otherwise sink the whole product.
 * Aggregators index pools, and a token on the curve has no pool, so nothing
 * outside this site can see it: not GeckoTerminal, not DexScreener, not our
 * own screener, which reads them. But a token only graduates into a pool by
 * being bought to four ETH first. Invisible until it graduates, and it cannot
 * graduate while invisible.
 *
 * So the curve phase has exactly one venue, and it has to be this one. That is
 * not a limitation to work around; it is the reason a launchpad is worth
 * building. Buyers come here because it is the only place these exist.
 */

const RPC =
  process.env.ALCHEMY_HTTPS_URL ?? "https://rpc.mainnet.chain.robinhood.com";

export type CurveToken = {
  address: Address;
  name: string;
  symbol: string;
  creator: Address;
  /**
   * What this token trades against. `0x0…0` is native ETH.
   *
   * Carried on the token rather than looked up per component, because every
   * amount on a curve page is denominated in it and a component that has to
   * ask separately is a component that will forget to.
   */
  quote: Address;
  /** The creator's own cut of every trade, in basis points. */
  creatorTaxBps: number;
  /** ETH paid in, net of fees. */
  raisedEth: number;
  /** 0 to 1, clamped. */
  progress: number;
  /** Current price in ETH per token, from the curve rather than a pool. */
  priceEth: number | null;
  imageUrl: string | null;
  description: string | null;
};

const ERC20_ABI = [
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

/** One ETH of buying, quoted against the curve, gives the marginal price. */
const PROBE = 10n ** 16n; // 0.01 ETH

export async function getCurveTokens(limit = 60): Promise<CurveToken[]> {
  if (!isLaunchpadDeployed()) return [];

  const chain = createPublicClient({ chain: robinhoodChain, transport: http(RPC) });
  const pad = { address: LAUNCHPAD_ADDRESS as Address, abi: LAUNCHPAD_ABI } as const;

  let count: number;
  try {
    count = Number(await chain.readContract({ ...pad, functionName: "tokenCount" }));
  } catch {
    return [];
  }
  if (count === 0) return [];

  // Newest first. A launchpad's front page is about what just appeared, and
  // the array is append-only so the tail is the newest.
  const indexes: bigint[] = [];
  for (let i = count - 1; i >= 0 && indexes.length < limit; i--) indexes.push(BigInt(i));

  /**
   * Guarded, because this board must never be able to take the page with it.
   *
   * `tokenCount` above was wrapped and the reads under it were not, which held
   * only while the launchpad was empty: at zero tokens the early return meant
   * these lines never ran. The first real launch took execution past it, the
   * multicall threw, nothing caught it, and the whole landing page returned a
   * 500. A board that cannot load is an empty board, not a broken site.
   */
  let addresses: Address[];
  let records: readonly LaunchTuple[];
  try {
    addresses = (await chain.multicall({
      contracts: indexes.map((i) => ({ ...pad, functionName: "allTokens" as const, args: [i] as const })),
      allowFailure: false,
    })) as Address[];

    records = (await chain.multicall({
      contracts: addresses.map((a) => ({ ...pad, functionName: "launches" as const, args: [a] as const })),
      allowFailure: false,
    })) as readonly LaunchTuple[];
  } catch {
    return [];
  }

  // Graduated tokens have a real pool, so the screener already covers them.
  const live = addresses
    .map((address, i) => ({ address, record: toLaunchRecord(records[i]) }))
    .filter(({ record }) => !record.graduated);
  if (live.length === 0) return [];

  const [meta, quotes, images] = await Promise.all([
    chain.multicall({
      contracts: live.flatMap(({ address }) => [
        { address, abi: ERC20_ABI, functionName: "name" as const },
        { address, abi: ERC20_ABI, functionName: "symbol" as const },
      ]),
      allowFailure: true,
    }),
    chain.multicall({
      contracts: live.map(({ address }) => ({
        ...pad,
        functionName: "quoteBuy" as const,
        args: [address, PROBE] as const,
      })),
      allowFailure: true,
    }),
    getLaunchpadArtwork(live.map(({ address }) => address)),
  ]);

  return live.map(({ address, record }, i) => {
    const raisedEth =
      Number(record.quoteReserve) / 10 ** quoteAsset(record.quote).decimals;
    const name = meta[i * 2];
    const symbol = meta[i * 2 + 1];
    const quote = quotes[i];

    // Tokens per 0.01 ETH, inverted into ETH per token.
    const out = quote?.status === "success" ? Number(quote.result as bigint) / 1e18 : 0;
    const extra = images.get(address.toLowerCase());

    return {
      address,
      name: name?.status === "success" ? (name.result as string) : "Unknown",
      symbol: symbol?.status === "success" ? (symbol.result as string) : "?",
      creator: record.creator,
      quote: record.quote,
      creatorTaxBps: record.creatorTaxBps,
      raisedEth,
      progress: Math.min(raisedEth / quoteAsset(record.quote).graduation, 1),
      priceEth: out > 0 ? 0.01 / out : null,
      imageUrl: extra?.imageUrl ?? null,
      description: extra?.description ?? null,
    };
  });
}


/**
 * One token, if it is still on its curve.
 *
 * Returns null for anything else: an address that was never launched here, and
 * a token that has already graduated. A graduated token has a real pool, so the
 * pool page is the right page for it and this one would be a worse copy.
 */
export async function getCurveToken(address: string): Promise<CurveToken | null> {
  if (!isLaunchpadDeployed()) return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return null;

  const token = address as Address;
  const chain = createPublicClient({ chain: robinhoodChain, transport: http(RPC) });
  const pad = { address: LAUNCHPAD_ADDRESS as Address, abi: LAUNCHPAD_ABI } as const;

  try {
    const record = (await chain.readContract({
      ...pad,
      functionName: "launches",
      args: [token],
    })) as LaunchTuple;

    // A creator of zero means this contract has never heard of the address.
    const launch = toLaunchRecord(record);
    if (launch.creator === "0x0000000000000000000000000000000000000000") return null;
    if (launch.graduated) return null;

    const [meta, quote, images] = await Promise.all([
      chain.multicall({
        contracts: [
          { address: token, abi: ERC20_ABI, functionName: "name" as const },
          { address: token, abi: ERC20_ABI, functionName: "symbol" as const },
        ],
        allowFailure: true,
      }),
      chain
        .readContract({ ...pad, functionName: "quoteBuy", args: [token, PROBE] })
        .catch(() => 0n),
      getLaunchpadArtwork([token]),
    ]);

    const raisedEth =
      Number(launch.quoteReserve) / 10 ** quoteAsset(launch.quote).decimals;
    const out = Number(quote as bigint) / 1e18;
    const extra = images.get(token.toLowerCase());

    return {
      address: token,
      name: meta[0]?.status === "success" ? (meta[0].result as string) : "Unknown",
      symbol: meta[1]?.status === "success" ? (meta[1].result as string) : "?",
      creator: launch.creator,
      quote: launch.quote,
      creatorTaxBps: launch.creatorTaxBps,
      raisedEth,
      progress: Math.min(raisedEth / quoteAsset(launch.quote).graduation, 1),
      priceEth: out > 0 ? 0.01 / out : null,
      imageUrl: extra?.imageUrl ?? null,
      description: extra?.description ?? null,
    };
  } catch {
    return null;
  }
}
