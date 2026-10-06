import { network } from "hardhat";
import { parseEther, formatEther } from "viem";

/**
 * Deploys the launchpad.
 *
 * The token contract is not deployed here. Every launched token is created by
 * the launchpad itself, from bytecode already embedded in it, which is what
 * lets a buyer verify one token and trust all of them.
 *
 *   DEPLOYER_KEY=0x... npm run deploy:testnet
 *
 * Testnet first, always. The curve holds other people's ETH and these contracts
 * have not been audited.
 */

const LAUNCH_FEE = parseEther("0.002");

/**
 * Verified by interrogating the chain, not by trusting the canonical
 * Uniswap addresses. The well-known V3 factory address does exist here and
 * is a 2,110-byte decoy; the real one was found by asking a live pool for
 * its factory and proving the round trip through getPool.
 *
 * Getting these wrong means graduation creates no market, so they are
 * checked for code at deploy time below rather than assumed.
 */
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const V3_FACTORY = "0x1f7d7550b1b028f7571e69a784071f0205fd2efa";

async function main() {
  const { viem, networkName } = await network.connect();

  const [wallet] = await viem.getWalletClients();
  const client = await viem.getPublicClient();

  if (!wallet) {
    throw new Error("No account. Set DEPLOYER_KEY in the environment.");
  }

  const balance = await client.getBalance({ address: wallet.account.address });

  console.log(`network   ${networkName}`);
  console.log(`deployer  ${wallet.account.address}`);
  console.log(`balance   ${formatEther(balance)} ETH`);
  console.log(`fee       ${formatEther(LAUNCH_FEE)} ETH per launch\n`);

  if (balance === 0n) {
    throw new Error("Deployer has no ETH. Fund it before deploying.");
  }

  for (const [name, address] of [["weth", WETH], ["v3Factory", V3_FACTORY]] as const) {
    const code = await client.getCode({ address });
    if (!code || code === "0x") {
      throw new Error(`${name} ${address} has no code on this chain.`);
    }
    console.log(`  ${name.padEnd(12)} ${address}  ${(code.length / 2 - 1).toLocaleString("en-US")} bytes`);
  }

  const pad = await viem.deployContract("HoodLaunchpad", [
    LAUNCH_FEE,
    WETH,
    V3_FACTORY,
  ]);
  console.log(`HoodLaunchpad  ${pad.address}`);

  // Read it back rather than trusting the deployment receipt. A contract that
  // deployed but reverted in its constructor is a real failure mode.
  const owner = await pad.read.owner();
  const fee = await pad.read.launchFee();
  const curveSupply = await pad.read.CURVE_SUPPLY();

  console.log(`  owner        ${owner}`);
  console.log(`  launchFee    ${formatEther(fee)} ETH`);
  console.log(`  curveSupply  ${formatEther(curveSupply)} tokens`);

  console.log(
    `\nAdd to the app's environment:\n` +
      `  NEXT_PUBLIC_LAUNCHPAD_ADDRESS=${pad.address}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
