import { network } from "hardhat";
import { formatEther, getAddress, isAddress, parseEther } from "viem";

/**
 * Changes what the launchpad charges to create a token.
 *
 * A setter rather than a redeploy, which is the whole reason the fee is a
 * storage variable and not a constant. Existing launches, curves and pools are
 * untouched; only the price of the next launch changes.
 *
 * The app reads `launchFee()` before it sends anything, so the form follows
 * this automatically. Nothing needs to be rebuilt after running it.
 *
 * The default below is the price we settled on. It is written here rather than
 * left to be typed at the prompt because a fee is a decision, and a decision
 * that has to be retyped correctly every time is one mistyped zero away from
 * charging a hundred times too much.
 *
 *   npm run set:fee                 uses the default
 *   FEE_ETH=0.001 npm run set:fee   overrides it
 */

/** The launch fee, in ETH. Roughly two dollars, which is a spam filter. */
const DEFAULT_FEE_ETH = "0.000444";

const LAUNCHPAD = process.env.NEXT_PUBLIC_LAUNCHPAD_ADDRESS ?? "";
const FEE_ETH = process.env.FEE_ETH || DEFAULT_FEE_ETH;

const ABI = [
  { name: "launchFee", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "owner", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    name: "setLaunchFee",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "next", type: "uint256" }],
    outputs: [],
  },
] as const;

async function main() {
  if (!isAddress(LAUNCHPAD)) throw new Error("Set NEXT_PUBLIC_LAUNCHPAD_ADDRESS in .env.local.");

  const next = parseEther(FEE_ETH);

  const { viem } = await network.connect({ network: "robinhood" });
  const client = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();
  const launchpad = getAddress(LAUNCHPAD);

  const [current, owner] = await Promise.all([
    client.readContract({ address: launchpad, abi: ABI, functionName: "launchFee" }),
    client.readContract({ address: launchpad, abi: ABI, functionName: "owner" }),
  ]);

  console.log(`launchpad  ${launchpad}`);
  console.log(`fee now    ${formatEther(current)} ETH`);
  console.log(`fee next   ${formatEther(next)} ETH\n`);

  if (current === next) {
    console.log("Already set to that. Nothing to do.");
    return;
  }
  if (getAddress(owner) !== getAddress(wallet.account.address)) {
    throw new Error(
      `This key is ${wallet.account.address}, but the owner is ${owner}.`,
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
    functionName: "setLaunchFee",
    args: [next],
    account: wallet.account,
  });

  const hash = await wallet.writeContract({
    address: launchpad,
    abi: ABI,
    functionName: "setLaunchFee",
    args: [next],
    gas: gas + gas / 5n,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  const after = await client.readContract({ address: launchpad, abi: ABI, functionName: "launchFee" });

  console.log(`status     ${receipt.status}`);
  console.log(`fee now    ${formatEther(after)} ETH`);
  if (after !== next) throw new Error("The fee did not change.");
  console.log("\nDone. The create form picks this up on its next load.");
}

main().catch((e) => {
  console.error(String(e).split("\n")[0]);
  process.exitCode = 1;
});
