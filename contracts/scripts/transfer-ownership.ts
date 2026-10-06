import { network } from "hardhat";
import { formatEther, getAddress, isAddress } from "viem";

/**
 * Hands the launchpad to a different owner.
 *
 * The deploying key was pasted into a chat transcript, which means it should
 * be treated as public. Owning the launchpad is not nothing: the owner sets
 * the launch fee and can pass ownership on again. Neither touches user funds
 * or the liquidity locked in graduated pools, but both are worth moving off a
 * key that is known.
 *
 * The new owner is read from the environment rather than hardcoded, and it is
 * checked against the chain before and after, because a one-way transfer to a
 * mistyped address cannot be undone.
 *
 * It also refuses to run while the launch fee is still the deploy-time 0.002.
 * `setLaunchFee` is owner-only, so this transfer takes the ability to change it
 * with it: run in the wrong order, the price of a launch is frozen at the
 * placeholder until the new owner's key is in hand and funded. Fee first, then
 * this. Set ALLOW_DEPLOY_FEE=1 if that is genuinely what you want.
 *
 *   NEW_OWNER=0x… npx hardhat run scripts/transfer-ownership.ts --network robinhood
 */

const LAUNCHPAD = process.env.NEXT_PUBLIC_LAUNCHPAD_ADDRESS ?? "";
const NEW_OWNER = process.env.NEW_OWNER ?? "";

const ABI = [
  { name: "owner", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "launchFee", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    name: "transferOwnership",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "next", type: "address" }],
    outputs: [],
  },
] as const;

/** What the launchpad charges at deploy time, before anybody sets it. */
const DEPLOY_TIME_FEE = 2_000_000_000_000_000n; // 0.002 ETH

async function main() {
  if (!isAddress(LAUNCHPAD)) {
    throw new Error("Set NEXT_PUBLIC_LAUNCHPAD_ADDRESS in .env.local.");
  }
  if (!isAddress(NEW_OWNER)) {
    throw new Error("Set NEW_OWNER to the address that should own the launchpad.");
  }

  const { viem } = await network.connect({ network: "robinhood" });
  const client = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();

  const launchpad = getAddress(LAUNCHPAD);
  const next = getAddress(NEW_OWNER);
  const [current, fee] = await Promise.all([
    client.readContract({ address: launchpad, abi: ABI, functionName: "owner" }),
    client.readContract({ address: launchpad, abi: ABI, functionName: "launchFee" }),
  ]);

  console.log(`launchpad  ${launchpad}`);
  console.log(`owner now  ${current}`);
  console.log(`owner next ${next}`);
  console.log(`launch fee ${formatEther(fee)} ETH`);
  console.log("");

  if (fee === DEPLOY_TIME_FEE && process.env.ALLOW_DEPLOY_FEE !== "1") {
    throw new Error(
      "The launch fee is still the deploy-time 0.002 ETH. Setting it is " +
        "owner-only, so this transfer would take that ability with it. Run " +
        "`npm run set:fee` first, or ALLOW_DEPLOY_FEE=1 to go ahead anyway.",
    );
  }

  if (getAddress(current) === next) {
    console.log("Already owned by that address. Nothing to do.");
    return;
  }
  if (getAddress(current) !== getAddress(wallet.account.address)) {
    throw new Error(
      `This key is ${wallet.account.address}, which does not own the launchpad.`,
    );
  }

  /**
   * An explicit gas limit for this one call.
   *
   * The network config pins `gas` to 2.7M so that deploying never estimates.
   * A node reserves `gas * gasPrice` from the balance before it will accept a
   * transaction, so that same limit applied to a 30,000-gas owner call demands
   * about 0.0012 ETH of headroom for a call that spends a fiftieth of it. On a
   * deployer wallet drained down to gas money the node simply refuses, and
   * viem reports it as an unknown RPC error rather than anything about gas.
   *
   * Estimating here overrides that. A fifth on top absorbs the difference
   * between the estimate and the block the transaction actually lands in;
   * whatever is not burned is refunded.
   */
  const gas = await client.estimateContractGas({
    address: launchpad,
    abi: ABI,
    functionName: "transferOwnership",
    args: [next],
    account: wallet.account,
  });

  const hash = await wallet.writeContract({
    address: launchpad,
    abi: ABI,
    functionName: "transferOwnership",
    args: [next],
    gas: gas + gas / 5n,
  });
  console.log(`sent       ${hash}`);

  const receipt = await client.waitForTransactionReceipt({ hash });
  const after = await client.readContract({ address: launchpad, abi: ABI, functionName: "owner" });

  console.log(`status     ${receipt.status}`);
  console.log(`owner now  ${after}`);

  if (getAddress(after) !== next) throw new Error("Owner did not change. Nothing was transferred.");
  console.log("\nDone. The old key no longer controls the launchpad.");
}

main().catch((e) => {
  console.error(String(e).split("\n")[0]);
  process.exitCode = 1;
});
