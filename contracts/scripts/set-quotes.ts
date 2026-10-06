import { network } from "hardhat";
import { parseEther, parseUnits, formatUnits, getAddress } from "viem";

/**
 * Configures what the launchpad accepts as a pairing.
 *
 * Separate from deployment so pairings can be added, retuned or withdrawn
 * without touching the contract. Owner-only, and safe to re-run: setting a
 * quote to the values it already holds costs gas and changes nothing.
 *
 * ── How these figures were chosen ──────────────────────────────────────────
 *
 * Every graduation is roughly ten thousand dollars at the prices read on
 * 9 September 2026, so a token's life on the curve is comparable whichever
 * asset it paired against. Without that, the boards cannot be read side by
 * side: a token 80% of the way to 4 ETH and one 80% of the way to 40 NVDA
 * would be describing very different amounts of money.
 *
 * The virtual reserve is 0.375 of the graduation throughout, which is the ratio
 * version one used (1.5 against 4). It sets the opening price and how steeply
 * the curve climbs, and keeping it constant means a curve feels the same on
 * every pairing.
 *
 * ── What ages badly ────────────────────────────────────────────────────────
 *
 * Stock prices move and these figures do not. NVDA at $224 makes 45 NVDA worth
 * ten thousand dollars; at $450 the same threshold is twenty. That is not a bug
 * so much as a maintenance job: re-run this when the drift starts to matter.
 * Nothing breaks in the meantime, tokens simply graduate at a different real
 * value than intended.
 */

const RATIO = 0.375;

type Quote = {
  symbol: string;
  address: string;
  decimals: number;
  /** Graduation, in whole units of the asset. */
  graduation: number;
  /** What one unit was worth when this was set, for the next person. */
  usd: number | null;
};

const QUOTES: Quote[] = [
  { symbol: "ETH", address: "0x0000000000000000000000000000000000000000", decimals: 18, graduation: 4, usd: 2475 },
  { symbol: "USDG", address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", decimals: 6, graduation: 10_000, usd: 1 },
  { symbol: "NVDA", address: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", decimals: 18, graduation: 45, usd: 224.45 },
  { symbol: "SPCX", address: "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea", decimals: 18, graduation: 70, usd: 145.98 },
  { symbol: "META", address: "0xc0d6457c16cc70d6790dd43521c899c87ce02f35", decimals: 18, graduation: 15, usd: 654.08 },
  { symbol: "GME", address: "0x1b0e319c6a659f002271b69db8a7df2f911c153e", decimals: 18, graduation: 500, usd: 19.89 },
  { symbol: "SPY", address: "0x117cc2133c37b721f49de2a7a74833232b3b4c0c", decimals: 18, graduation: 13, usd: 768.02 },
];

function units(amount: number, decimals: number): bigint {
  return decimals === 18
    ? parseEther(String(amount))
    : parseUnits(String(amount), decimals);
}

async function main() {
  const launchpad = process.env.NEXT_PUBLIC_LAUNCHPAD_ADDRESS ?? "";
  if (!launchpad) throw new Error("Set NEXT_PUBLIC_LAUNCHPAD_ADDRESS in .env.local.");

  const { viem } = await network.connect({ network: "robinhood" });
  const client = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();

  const pad = await viem.getContractAt("HoodLaunchpadV2", getAddress(launchpad));
  const owner = await pad.read.owner();

  console.log(`launchpad  ${getAddress(launchpad)}`);
  console.log(`owner      ${owner}`);
  console.log(`signer     ${wallet.account.address}\n`);

  if (getAddress(owner) !== getAddress(wallet.account.address)) {
    throw new Error(`This key is ${wallet.account.address}, but the owner is ${owner}.`);
  }

  for (const q of QUOTES) {
    const asset = getAddress(q.address);
    const graduation = units(q.graduation, q.decimals);
    const virtual = units(q.graduation * RATIO, q.decimals);

    const current = await pad.read.quotes([asset]);
    if (current[0] && current[1] === virtual && current[2] === graduation) {
      console.log(`  ${q.symbol.padEnd(6)} unchanged`);
      continue;
    }

    await pad.write.setQuote([asset, true, virtual, graduation]);
    const set = await pad.read.quotes([asset]);
    const worth = q.usd ? `  (~$${Math.round(q.graduation * q.usd).toLocaleString()})` : "";
    console.log(
      `  ${q.symbol.padEnd(6)} graduation=${formatUnits(set[2], q.decimals).padStart(10)}${worth}`,
    );
  }

  console.log("\nDone. The create form reads these on its next load.");
}

main().catch((e) => {
  console.error(String(e).split("\n")[0]);
  process.exitCode = 1;
});
