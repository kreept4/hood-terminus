import { defineChain } from "viem";

/**
 * Robinhood Chain, mainnet.
 *
 * Arbitrum Orbit L2, ETH gas token, ~100ms blocks, permissionless deployment.
 * Verified against docs.robinhood.com/chain on 2026-09-03.
 *
 * viem does not ship a chain definition for 4663 at the version we pin, so it
 * is defined here once and imported everywhere. Nothing else in the codebase
 * writes a chain id literal.
 */
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
      apiUrl: "https://robinhoodchain.blockscout.com/api",
    },
  },
  /**
   * Multicall3, at the canonical address, confirmed by reading its bytecode on
   * this chain rather than assumed from other deployments.
   *
   * viem refuses `client.multicall` outright when a chain does not declare
   * this, and the refusal surfaces as an empty panel rather than an error. The
   * creator's own token list read this way, so a launched token was invisible
   * to the person who launched it while the contract held it perfectly well.
   */
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
  testnet: false,
});

/**
 * Robinhood Chain, testnet. The full trade path is exercised here before it
 * ever runs against mainnet with real size.
 */
export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhood-testnet.blockscout.com",
    },
  },
  testnet: true,
});

export const CHAIN_ID = robinhoodChain.id;

/** Roughly 100ms. Used to convert block deltas into wall time in the UI. */
export const BLOCK_TIME_MS = 100;

export function explorerAddressUrl(address: string): string {
  return `${robinhoodChain.blockExplorers.default.url}/address/${address}`;
}

export function explorerTxUrl(hash: string): string {
  return `${robinhoodChain.blockExplorers.default.url}/tx/${hash}`;
}
