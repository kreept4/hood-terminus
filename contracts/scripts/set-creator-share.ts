import { network } from "hardhat";
import { formatEther, getAddress, isAddress } from "viem";

/**
 * Changes the creator's share of the trading fee.
 *
 * The launchpad charges 1% on every bonding-curve trade and splits it between
 * the creator and the platform on `creatorShareBps`. This moves that figure.
 * It is the one number in the contract an owner can change, which is why
 * `MIN_CREATOR_SHARE_BPS` exists: the share can be raised freely but never cut
 * below half, so nobody who launches a token can have the deal moved out from
 * under them afterwards.
 *
 * What it does not touch: tokens already launched keep trading on the same
 * curve, and graduated tokens are unaffected because the launchpad stops
 * collecting a fee once a token graduates to its own pool. The change applies
 * to fees collected from the next trade onward, on every token still on a
 * curve, not only to tokens launched after it.
 *
 * The app reads `creatorShareBps` from the chain rather than hardcoding it, so
 * nothing needs rebuilding or redeploying after this runs.
 *
 * Sending is opt-in. With no `SEND`, it prints the transaction and the gas it
 * would cost and stops, because the whole point of a dry run is to read the
 * numbers before they are final:
 *
 *   npm run set:creator-share            prints what it would send
 *   SEND=1 npm run set:creator-share     sends it
 *   SHARE_BPS=7500 npm run set:creator-share
 */

/**
 * The share, in basis points. 8,000 is 80%.
 *
 * Written here rather than typed at the prompt for the same reason as the
 * launch fee: a split is a decision, and a decision retyped every time is one
 * missing zero away from paying creators 8% instead of 80%.
 */
const DEFAULT_SHARE_BPS = 8_000;

const LAUNCHPAD = process.env.NEXT_PUBLIC_LAUNCHPAD_ADDRESS ?? "";
const SHARE_BPS = Number(process.env.SHARE_BPS || DEFAULT_SHARE_BPS);
const SEND = process.env.SEND === "1";

const ABI = [
  { name: "creatorShareBps", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { name: "MIN_CREATOR_SHARE_BPS", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { name: "TRADE_FEE_BPS", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { name: "owner", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    name: "setCreatorShare",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "next", type: "uint16" }],
    outputs: [],
  },
] as const;

const pct = (bps: number | bigint) => `${Number(bps) / 100}%`;

async function main() {
  if (!isAddress(LAUNCHPAD)) throw new Error("Set NEXT_PUBLIC_LAUNCHPAD_ADDRESS in .env.local.");
  if (!Number.isInteger(SHARE_BPS) || SHARE_BPS < 0 || SHARE_BPS > 10_000) {
    throw new Error(`SHARE_BPS must be a whole number of basis points, 0 to 10000. Got ${process.env.SHARE_BPS}.`);
  }

  const next = SHARE_BPS;

  const { viem } = await network.connect({ network: "robinhood" });
  const client = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();
  const launchpad = getAddress(LAUNCHPAD);

  const [current, floor, tradeFee, owner, balance] = await Promise.all([
    client.readContract({ address: launchpad, abi: ABI, functionName: "creatorShareBps" }),
    client.readContract({ address: launchpad, abi: ABI, functionName: "MIN_CREATOR_SHARE_BPS" }),
    client.readContract({ address: launchpad, abi: ABI, functionName: "TRADE_FEE_BPS" }),
    client.readContract({ address: launchpad, abi: ABI, functionName: "owner" }),
    client.getBalance({ address: wallet.account.address }),
  ]);

  console.log(`launchpad    ${launchpad}`);
  console.log(`trade fee    ${pct(tradeFee)} of each curve trade`);
  console.log(`floor        ${pct(floor)} to the creator, enforced by the contract`);
  console.log(`share now    ${pct(current)} creator / ${pct(10_000 - Number(current))} platform`);
  console.log(`share next   ${pct(next)} creator / ${pct(10_000 - next)} platform\n`);

  if (Number(current) === next) {
    console.log("Already set to that. Nothing to do.");
    return;
  }
  if (next < Number(floor)) {
    throw new Error(`${pct(next)} is below the contract floor of ${pct(floor)}. It would revert.`);
  }
  if (getAddress(owner) !== getAddress(wallet.account.address)) {
    throw new Error(`This key is ${wallet.account.address}, but the owner is ${owner}.`);
  }

  // Estimated rather than taking the network's pinned 2.7M limit, which a node
  // would reserve in full against the balance for a ~30,000-gas owner call.
  // See the note in set-launch-fee.ts; this hits the same wall.
  const gas = await client.estimateContractGas({
    address: launchpad,
    abi: ABI,
    functionName: "setCreatorShare",
    args: [next],
    account: wallet.account,
  });
  const gasPrice = await client.getGasPrice();
  const limit = gas + gas / 5n;

  console.log(`from         ${wallet.account.address}`);
  console.log(`balance      ${formatEther(balance)} ETH`);
  console.log(`call         setCreatorShare(${next})`);
  console.log(`gas          ${gas} estimated, ${limit} limit`);
  console.log(`cost         up to ${formatEther(limit * gasPrice)} ETH\n`);

  if (!SEND) {
    console.log("Nothing sent. Re-run with SEND=1 to send it.");
    return;
  }

  const hash = await wallet.writeContract({
    address: launchpad,
    abi: ABI,
    functionName: "setCreatorShare",
    args: [next],
    gas: limit,
  });
  console.log(`sent         ${hash}`);

  const receipt = await client.waitForTransactionReceipt({ hash });
  const after = await client.readContract({ address: launchpad, abi: ABI, functionName: "creatorShareBps" });

  console.log(`status       ${receipt.status}`);
  console.log(`gas used     ${receipt.gasUsed}`);
  console.log(`share now    ${pct(after)} creator / ${pct(10_000 - Number(after))} platform`);
  if (Number(after) !== next) throw new Error("The share did not change.");
  console.log("\nDone. The app reads this from the chain, so it needs no rebuild.");
}

main().catch((e) => {
  console.error(String(e).split("\n")[0]);
  process.exitCode = 1;
});
