import { network } from "hardhat";
import { formatEther, parseEther, parseUnits, formatUnits, getAddress } from "viem";

/**
 * Deploys version two and configures what it will accept as a pairing.
 *
 * Deployment and configuration are one script on purpose. A launchpad deployed
 * without its quote assets set is a launchpad where only ETH works, and the gap
 * between the two transactions is a window where a creator picks the one option
 * available and gets a token they did not want.
 *
 * Every figure below is written in the asset's own units. USDG has six
 * decimals and NVDA has eighteen, both confirmed by reading the chain, and
 * writing `8000e18` for USDG would set a graduation bar of eight trillion
 * dollars. That is the single easiest way to get this wrong.
 */

const WETH = getAddress("0x0bd7d308f8e1639fab988df18a8011f41eacad73");
const V3_FACTORY = getAddress("0x1f7d7550b1b028f7571e69a784071f0205fd2efa");

const LAUNCH_FEE = parseEther(process.env.FEE_ETH ?? "0.000444");

/**
 * What may be paired against, and on what terms.
 *
 * `virtual` opens the curve at a finite price and sets how fast it climbs.
 * `graduation` is what the curve must take in before a real pool opens.
 *
 * The ETH figures are version one's, unchanged. The others are set to roughly
 * the same dollar value so a token's life on the curve is comparable whatever
 * it paired against, which is what makes the boards mean anything side by side.
 */
const QUOTES = [
  {
    label: "ETH (native)",
    address: "0x0000000000000000000000000000000000000000" as const,
    decimals: 18,
    virtual: parseEther("1.5"),
    graduation: parseEther("4"),
  },
  {
    label: "USDG",
    address: getAddress("0x5fc5360d0400a0fd4f2af552add042d716f1d168"),
    decimals: 6,
    virtual: parseUnits("3000", 6),
    graduation: parseUnits("8000", 6),
  },
  {
    label: "NVDA",
    address: getAddress("0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec"),
    decimals: 18,
    virtual: parseEther("15"),
    graduation: parseEther("40"),
  },
];

async function main() {
  const { viem } = await network.connect({ network: "robinhood" });
  const client = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();

  console.log(`network    robinhood`);
  console.log(`deployer   ${wallet.account.address}`);
  console.log(`balance    ${formatEther(await client.getBalance({ address: wallet.account.address }))} ETH`);
  console.log(`launch fee ${formatEther(LAUNCH_FEE)} ETH\n`);

  const pad = await viem.deployContract("HoodLaunchpadV2", [
    LAUNCH_FEE,
    WETH,
    V3_FACTORY,
  ]);
  console.log(`HoodLaunchpadV2  ${pad.address}\n`);

  for (const q of QUOTES) {
    // Native ETH is configured by the constructor; the rest are set here.
    if (q.address === "0x0000000000000000000000000000000000000000") {
      const on = await pad.read.quotes([q.address]);
      console.log(
        `  ${q.label.padEnd(13)} allowed=${on[0]}  graduation=${formatUnits(on[2], q.decimals)}`,
      );
      continue;
    }

    await pad.write.setQuote([q.address, true, q.virtual, q.graduation]);
    const set = await pad.read.quotes([q.address]);
    console.log(
      `  ${q.label.padEnd(13)} allowed=${set[0]}  graduation=${formatUnits(set[2], q.decimals)}`,
    );
  }

  console.log("\nAdd to the app's .env.local, then redeploy the site:");
  console.log(`  NEXT_PUBLIC_LAUNCHPAD_ADDRESS=${pad.address}`);
  console.log("\nOwnership is still the deploying key. Move it with transfer:owner.");
}

main().catch((e) => {
  console.error(String(e).split("\n")[0]);
  process.exitCode = 1;
});
