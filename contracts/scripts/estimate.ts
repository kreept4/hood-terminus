import { network } from "hardhat";
import { formatEther } from "viem";
import { artifacts } from "hardhat";

/** What deploying actually costs, measured rather than guessed. */
async function main() {
  const { viem } = await network.connect({ network: "forked" });
  const client = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();

  const artifact = await artifacts.readArtifact("HoodLaunchpad");

  const gas = await client.estimateGas({
    account: wallet.account.address,
    data: (artifact.bytecode +
      "00000000000000000000000000000000000000000000000000071afd498d0000") as `0x${string}`,
  });

  console.log(`deploy gas    ${gas.toLocaleString("en-US")}`);
  console.log(`bytecode      ${(artifact.bytecode.length - 2) / 2} bytes`);

  for (const gwei of [0.41, 1, 8.5]) {
    const wei = gas * BigInt(Math.round(gwei * 1e9));
    console.log(
      `  at ${String(gwei).padStart(5)} gwei  ${formatEther(wei)} ETH` +
        `   ~$${(Number(formatEther(wei)) * 2470).toFixed(2)}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
