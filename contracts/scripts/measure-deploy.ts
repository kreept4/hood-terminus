/**
 * What the deploy actually costs, measured rather than guessed.
 *
 * `gasLimit` in the config is a fixed number, and the reason it is fixed is
 * that estimation on this chain lies when the sender is thinly funded. A fixed
 * number that no longer fits the contract fails as "out of gas" during code
 * deposit, which reads like the contract is too large. So measure on the fork
 * before spending anything on mainnet.
 */
import { network } from "hardhat";
import { parseEther, getAddress, formatEther } from "viem";

const WETH = getAddress("0x0bd7d308f8e1639fab988df18a8011f41eacad73");
const V3_FACTORY = getAddress("0x1f7d7550b1b028f7571e69a784071f0205fd2efa");

const LIMIT = 3_300_000n;

async function main() {
  const { viem } = await network.connect({ network: "forked" });
  const client = await viem.getPublicClient();
  const before = await client.getBlockNumber();
  await viem.deployContract("HoodLaunchpadV2", [
    parseEther("0.000444"),
    WETH,
    V3_FACTORY,
  ]);
  const block = await client.getBlock({ blockNumber: before + 1n });
  const receipt = await client.getTransactionReceipt({ hash: block.transactions[0] });
  const used = receipt.gasUsed;
  console.log(`gas used     ${used}`);
  console.log(`config limit ${LIMIT}`);
  console.log(`headroom     ${LIMIT - used}`);

  // Priced at the live mainnet gas price rather than the fork's, since the
  // question this answers is whether the deployer can afford the real thing.
  const mainnet = await (await network.connect({ network: "robinhood" })).viem
    .getPublicClient();
  const price = await mainnet.getGasPrice();
  console.log(`gas price    ${Number(price) / 1e9} gwei`);
  console.log(`deploy costs ${formatEther(used * price)} ETH`);
}

main().catch((e) => {
  console.error(String(e).split("\n")[0]);
  process.exitCode = 1;
});
