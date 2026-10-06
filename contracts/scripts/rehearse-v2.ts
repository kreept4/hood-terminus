import { network } from "hardhat";
import { parseEther, parseUnits, formatEther, formatUnits, getAddress } from "viem";

/**
 * Version two, rehearsed against a fork of mainnet.
 *
 * The two things version two adds are the two things that could lose money, so
 * both are exercised here against real chain state rather than against mocks:
 * a curve denominated in a real ERC20, and a creator tax charged on top of the
 * platform fee.
 *
 * USDG is the interesting case and it is not a contrived one. It has six
 * decimals, it is the most common quote asset on this chain, and it is exactly
 * the shape that makes a hardcoded `4 ether` graduation threshold meaningless.
 * A launchpad that gets this wrong would fill a curve on the first buy.
 *
 * Funny money, real contracts. A failure here is a failure that would have
 * happened on mainnet, found for nothing.
 */

const ZERO = "0x0000000000000000000000000000000000000000" as const;
const WETH = getAddress("0x0bd7d308f8e1639fab988df18a8011f41eacad73");
const V3_FACTORY = getAddress("0x1f7d7550b1b028f7571e69a784071f0205fd2efa");
const USDG = getAddress("0x5fc5360d0400a0fd4f2af552add042d716f1d168");

const LAUNCH_FEE = parseEther("0.000444");

/** USDG is six decimals. Everything about it has to be written in its own units. */
const USDG_VIRTUAL = parseUnits("3000", 6);
const USDG_GRADUATION = parseUnits("8000", 6);

/** Nine percent, the cap. Rehearsed at the limit rather than in the middle. */
const CREATOR_TAX_BPS = 900;

const ERC20 = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "transfer", type: "function", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

const FACTORY = [
  { name: "getPool", type: "function", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }], outputs: [{ type: "address" }] },
] as const;

let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
  if (!pass) failures++;
}

async function main() {
  const { viem, networkHelpers } = await network.connect({ network: "forked" });
  const [deployer, creator, buyer] = await viem.getWalletClients();
  const client = await viem.getPublicClient();

  console.log(`chain     ${await client.getChainId()}`);
  console.log(`block     ${await client.getBlockNumber()}`);
  console.log("");

  const pad = await viem.deployContract("HoodLaunchpadV2", [
    LAUNCH_FEE,
    WETH,
    V3_FACTORY,
  ]);
  console.log(`launchpad ${pad.address}\n`);

  // ── Native pairing must behave exactly as version one did ───────────────
  console.log("Native pairing");

  const nativeToken = await launch(pad, creator, ZERO, 0, "Rehearsal Cat", "REHCAT");
  await pad.write.buy([nativeToken, 0n], { value: parseEther("1"), account: buyer.account });

  const nativeLaunch = await pad.read.launches([nativeToken]);
  check("curve took the ether", nativeLaunch[2] > 0n, formatEther(nativeLaunch[2]) + " ETH");
  check("buyer holds tokens", (await tokenBalance(client, nativeToken, buyer.account.address)) > 0n);

  // ── A real six-decimal ERC20 as the quote asset ─────────────────────────
  console.log("\nUSDG pairing");

  await pad.write.setQuote([USDG, true, USDG_VIRTUAL, USDG_GRADUATION]);
  const configured = await pad.read.quotes([USDG]);
  check("USDG allowed", configured[0]);
  check("threshold in USDG units", configured[2] === USDG_GRADUATION, formatUnits(configured[2], 6) + " USDG");

  /**
   * USDG has to come from somewhere on a fork.
   *
   * Taken from a live pool by impersonating it, which is the cheapest way to
   * hold a real asset at a real address without a faucet. Nothing is minted, so
   * the token behaves exactly as it does on mainnet.
   */
  const source = await findUsdgSource(client);
  if (!source) {
    console.log("  SKIP  no USDG source found on this fork");
    process.exitCode = failures > 0 ? 1 : 0;
    return;
  }
  const funding = parseUnits("40000", 6);
  await networkHelpers.impersonateAccount(source);
  await networkHelpers.setBalance(source, parseEther("1"));
  const whale = await viem.getWalletClient(source);
  await whale.writeContract({ address: USDG, abi: ERC20, functionName: "transfer", args: [buyer.account.address, funding] });
  check("buyer funded with USDG", (await usdg(client, buyer.account.address)) >= funding);

  const usdgToken = await launch(pad, creator, USDG, CREATOR_TAX_BPS, "Dollar Dog", "DDOG");

  await buyer.writeContract({ address: USDG, abi: ERC20, functionName: "approve", args: [pad.address, funding] });

  const spend = parseUnits("1000", 6);
  const usdgBefore = await usdg(client, buyer.account.address);
  await pad.write.buyWithQuote([usdgToken, spend, 0n], { account: buyer.account });

  check("USDG left the buyer", (await usdg(client, buyer.account.address)) === usdgBefore - spend);
  check("curve holds USDG", (await usdg(client, pad.address)) >= spend);
  check("buyer holds the token", (await tokenBalance(client, usdgToken, buyer.account.address)) > 0n);

  // ── The creator tax ─────────────────────────────────────────────────────
  const creatorOwed = await pad.read.feesOwed([creator.account.address, USDG]);
  const platformOwed = await pad.read.feesOwed([deployer.account.address, USDG]);
  const expectedTax = (spend * BigInt(CREATOR_TAX_BPS)) / 10_000n;

  // Read the split off the pad rather than assuming it. It is the one figure
  // the owner can move after deployment, so a literal here would go stale the
  // first time it does, and it would go stale silently.
  const shareBps = BigInt(await pad.read.creatorShareBps());
  const tradeFee = (spend * 100n) / 10_000n;
  const expectedCreatorCut = (tradeFee * shareBps) / 10_000n;
  const expectedPlatform = tradeFee - expectedCreatorCut;

  check(`creator earned the 9% tax plus ${Number(shareBps) / 100}% of the fee`,
    creatorOwed === expectedTax + expectedCreatorCut,
    formatUnits(creatorOwed, 6) + " USDG");
  check("platform share is untouched by the tax", platformOwed === expectedPlatform,
    formatUnits(platformOwed, 6) + " USDG");

  // ── Selling back ────────────────────────────────────────────────────────
  const held = await tokenBalance(client, usdgToken, buyer.account.address);
  await buyer.writeContract({ address: usdgToken, abi: ERC20, functionName: "approve", args: [pad.address, held] });
  const beforeSell = await usdg(client, buyer.account.address);
  await pad.write.sell([usdgToken, held, 0n], { account: buyer.account });
  const afterSell = await usdg(client, buyer.account.address);

  check("sell paid out in USDG", afterSell > beforeSell, "+" + formatUnits(afterSell - beforeSell, 6));
  check("round trip did not profit", afterSell - beforeSell < spend);

  // ── Graduation and a real pool, against USDG ────────────────────────────
  console.log("\nGraduation against USDG");

  await pad.write.buyWithQuote([usdgToken, parseUnits("20000", 6), 0n], { account: buyer.account });
  const graduatedLaunch = await pad.read.launches([usdgToken]);
  check("graduated on the USDG threshold", graduatedLaunch[5]);

  await pad.write.finalisePool([usdgToken], { account: buyer.account });
  const pool = await pad.read.graduatedPool([usdgToken]);
  check("pool address recorded", pool !== ZERO, pool);

  const fromFactory = await client.readContract({
    address: V3_FACTORY, abi: FACTORY, functionName: "getPool", args: [usdgToken, USDG, 10_000],
  });
  check("the real factory knows this pool", getAddress(fromFactory) === getAddress(pool));
  check("pool holds USDG", (await usdg(client, pool)) > 0n, formatUnits(await usdg(client, pool), 6) + " USDG");
  check("pool holds the token", (await tokenBalance(client, usdgToken, pool)) > 0n);

  // ── Withdrawing, in the right asset ─────────────────────────────────────
  console.log("\nWithdrawing");

  const owedNow = await pad.read.feesOwed([creator.account.address, USDG]);
  const creatorBefore = await usdg(client, creator.account.address);
  await pad.write.withdrawFees([USDG], { account: creator.account });
  check("creator was paid in USDG", (await usdg(client, creator.account.address)) === creatorBefore + owedNow,
    formatUnits(owedNow, 6) + " USDG");

  console.log("");
  if (failures > 0) {
    console.log(`${failures} check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("Every check passed against real chain state.");
  }
}

async function launch(pad: any, who: any, quote: string, taxBps: number, name: string, symbol: string) {
  const hash = await pad.write.launch([name, symbol, ZERO, quote, taxBps], {
    value: LAUNCH_FEE,
    account: who.account,
  });
  const count = await pad.read.tokenCount();
  const token = await pad.read.allTokens([count - 1n]);
  console.log(`  launched  ${symbol}  ${token}  (tx ${hash.slice(0, 10)})`);
  return token as `0x${string}`;
}

function usdg(client: any, who: string): Promise<bigint> {
  return client.readContract({ address: USDG, abi: ERC20, functionName: "balanceOf", args: [who] });
}

function tokenBalance(client: any, token: string, who: string): Promise<bigint> {
  return client.readContract({ address: token, abi: ERC20, functionName: "balanceOf", args: [who] });
}

/** A live pool holding enough USDG to borrow from on the fork. */
async function findUsdgSource(client: any): Promise<`0x${string}` | null> {
  for (const fee of [100, 500, 3_000, 10_000, 40, 90]) {
    try {
      const pool = (await client.readContract({
        address: V3_FACTORY, abi: FACTORY, functionName: "getPool", args: [USDG, WETH, fee],
      })) as `0x${string}`;
      if (pool === ZERO) continue;
      const held = await usdg(client, pool);
      if (held > parseUnits("50000", 6)) return pool;
    } catch {
      // Tier does not exist on this factory. Try the next.
    }
  }
  return null;
}

main().catch((e) => {
  console.error(String(e).split("\n").slice(0, 4).join("\n"));
  process.exitCode = 1;
});
