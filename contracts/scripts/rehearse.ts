import { network } from "hardhat";
import { parseEther, formatEther } from "viem";

const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const V3_FACTORY = "0x1f7d7550b1b028f7571e69a784071f0205fd2efa";

/**
 * A full launch lifecycle against a local fork of mainnet.
 *
 * Exercises the path a real creator and a real buyer take, in order, and reads
 * the state back after each step. Everything runs against real chain state with
 * funny money, so a failure here is a failure that would have happened on
 * mainnet, discovered for nothing.
 */
async function main() {
  const { viem } = await network.connect({ network: "forked" });

  const [deployer, creator, buyer] = await viem.getWalletClients();
  const client = await viem.getPublicClient();

  console.log(`chain     ${await client.getChainId()}`);
  console.log(`block     ${await client.getBlockNumber()}`);
  console.log(`deployer  ${deployer.account.address}\n`);

  const pad = await viem.deployContract("HoodLaunchpad", [parseEther("0.002"), WETH, V3_FACTORY]);
  console.log(`deployed  ${pad.address}`);

  // ── Launch ───────────────────────────────────────────────────────────────
  const launchHash = await pad.write.launch(
    ["Rehearsal Cat", "REHCAT", "0x0000000000000000000000000000000000000000"],
    { account: creator.account, value: parseEther("0.002") },
  );
  const receipt = await client.waitForTransactionReceipt({ hash: launchHash });
  console.log(`launched  gas ${receipt.gasUsed}`);

  const token = (await pad.read.allTokens([0n])) as `0x${string}`;
  console.log(`token     ${token}`);

  // ── Buy ──────────────────────────────────────────────────────────────────
  const quoted = await pad.read.quoteBuy([token, parseEther("0.5")]);
  await pad.write.buy([token, 0n], {
    account: buyer.account,
    value: parseEther("0.5"),
  });

  const erc20 = await viem.getContractAt("HoodToken", token);
  const held = await erc20.read.balanceOf([buyer.account.address]);
  console.log(`bought    ${formatEther(held)} REHCAT`);
  console.log(`quote matched: ${quoted === held}`);

  // ── Sell half back ───────────────────────────────────────────────────────
  const half = held / 2n;
  await erc20.write.approve([pad.address, half], { account: buyer.account });
  const before = await client.getBalance({ address: buyer.account.address });
  await pad.write.sell([token, half, 0n], { account: buyer.account });
  const after = await client.getBalance({ address: buyer.account.address });
  console.log(`sold      recovered ${formatEther(after - before)} ETH (net of gas)`);

  // ── Fees ─────────────────────────────────────────────────────────────────
  const creatorOwed = await pad.read.feesOwed([creator.account.address]);
  const platformOwed = await pad.read.feesOwed([deployer.account.address]);
  console.log(`\nfees to creator   ${formatEther(creatorOwed)} ETH`);
  console.log(`fees to platform  ${formatEther(platformOwed)} ETH`);

  await pad.write.withdrawFees({ account: creator.account });
  console.log(`creator withdrew, owed now ${formatEther(await pad.read.feesOwed([creator.account.address]))} ETH`);

  // ── Solvency ─────────────────────────────────────────────────────────────
  const padBalance = await client.getBalance({ address: pad.address });
  const launch = (await pad.read.launches([token])) as readonly [string, bigint, bigint, boolean];
  const stillOwed = await pad.read.feesOwed([deployer.account.address]);
  const covered = padBalance >= launch[1] + stillOwed;

  console.log(`\npad holds     ${formatEther(padBalance)} ETH`);
  console.log(`curve reserve ${formatEther(launch[1])} ETH`);
  console.log(`unpaid fees   ${formatEther(stillOwed)} ETH`);
  console.log(`SOLVENT: ${covered}`);

  if (!covered) throw new Error("Pad owes more than it holds.");
  console.log("\nRehearsal passed.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
