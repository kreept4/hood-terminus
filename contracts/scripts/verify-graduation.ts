import { network } from "hardhat";
import { parseEther, formatEther, getAddress } from "viem";

/**
 * Graduation, against the real Uniswap factory on a fork of mainnet.
 *
 * The whole point of this feature is that a token becomes visible to
 * aggregators, and aggregators see a token when a DEX factory emits a pool
 * creation event. So the only test that means anything is one where the pool is
 * created by the actual factory this chain uses, at its actual address.
 */

const ZERO = "0x0000000000000000000000000000000000000000";
const WETH = getAddress("0x0bd7d308f8e1639fab988df18a8011f41eacad73");
const V3_FACTORY = getAddress("0x1f7d7550b1b028f7571e69a784071f0205fd2efa");
const LAUNCH_FEE = parseEther("0.002");

function ok(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
  if (!pass) process.exitCode = 1;
}

async function main() {
  const { viem } = await network.connect({ network: "forked" });
  const client = await viem.getPublicClient();
  const [deployer, creator, buyer, stranger] = await viem.getWalletClients();

  console.log(`fork block  ${await client.getBlockNumber()}`);
  console.log(`factory     ${V3_FACTORY}`);
  console.log(`weth        ${WETH}\n`);

  const pad = await viem.deployContract("HoodLaunchpad", [
    LAUNCH_FEE,
    WETH,
    V3_FACTORY,
  ]);
  console.log(`launchpad   ${pad.address}\n`);

  // ── Launch and fill the curve ────────────────────────────────────────────
  console.log("1. Launch and fill the curve");
  await pad.write.launch(
    ["Graduate Me", "GRAD", "0x0000000000000000000000000000000000000000"],
    { account: creator.account, value: LAUNCH_FEE },
  );
  const token = await pad.read.allTokens([0n]);
  console.log(`   token    ${token}`);

  // Under the threshold first, so graduation is definitely the trigger.
  await pad.write.buy([token, 0n], {
    account: buyer.account,
    value: parseEther("2"),
  });
  ok("not graduated below the threshold", !(await pad.read.launches([token]))[3]);
  ok("no pool yet", (await pad.read.graduatedPool([token])) === ZERO);

  // ── Cross it ─────────────────────────────────────────────────────────────
  console.log("\n2. Cross the graduation threshold");
  const fill = await pad.write.buy([token, 0n], {
    account: deployer.account,
    value: parseEther("4"),
  });
  const fillReceipt = await client.getTransactionReceipt({ hash: fill });

  const launch = await pad.read.launches([token]);
  ok("graduated", launch[3] as boolean);

  /**
   * The buy that graduates a token must not also build the pool.
   *
   * Creating, initialising and minting into a V3 pool measures at 5,083,530
   * gas against the real factory. Attaching that to whichever trade happens
   * to cross the threshold bills one arbitrary buyer roughly five million gas
   * for a market everyone uses, and fails their trade outright if they did
   * not send enough. The first version did exactly that, and silently created
   * no pool at all, because the internal call was capped below what the mint
   * turned out to need.
   *
   * So this asserts the buy stayed an ordinary trade. That is the fix, not a
   * side effect of it.
   */
  ok(
    "the graduating buy stayed an ordinary trade",
    fillReceipt.gasUsed < 600_000n,
    `${fillReceipt.gasUsed.toLocaleString("en-US")} gas`,
  );
  ok(
    "no pool until the market is opened",
    (await pad.read.graduatedPool([token])) === ZERO,
  );

  // Run from a wallet that is neither the owner nor the creator, because the
  // point of this being permissionless is that nobody waits on us for it.
  console.log("\n3. Anyone can open the market");
  const openHash = await pad.write.finalisePool([token], {
    account: stranger.account,
  });
  const openReceipt = await client.getTransactionReceipt({ hash: openHash });
  ok(
    "a stranger opened it",
    openReceipt.status === "success",
    `${openReceipt.gasUsed.toLocaleString("en-US")} gas`,
  );
  ok("pool address recorded", (await pad.read.graduatedPool([token])) !== ZERO);
  ok(
    "opening a second time is refused",
    await pad.write
      .finalisePool([token], { account: stranger.account })
      .then(() => false)
      .catch(() => true),
  );


  // ── Is it a real pool the factory knows about? ───────────────────────────
  console.log("\n4. The pool is real and the factory knows it");
  const factory = await viem.getContractAt("IUniswapV3Factory", V3_FACTORY);
  const known = await factory.read.getPool([token, WETH, 10_000]);
  const finalPool = await pad.read.graduatedPool([token]);

  ok(
    "factory returns the same pool",
    getAddress(known) === getAddress(finalPool),
    known,
  );

  const code = await client.getCode({ address: finalPool as `0x${string}` });
  ok("pool has code", Boolean(code && code !== "0x"), `${code ? (code.length - 2) / 2 : 0} bytes`);

  // ── Is there liquidity in it? ────────────────────────────────────────────
  console.log("\n5. The pool holds the liquidity");
  const erc20 = await viem.getContractAt("HoodToken", token);
  const poolTokens = await erc20.read.balanceOf([finalPool]);
  const weth = await viem.getContractAt("IWETH9", WETH);
  const poolWeth = await weth.read.balanceOf([finalPool]);

  ok("pool holds tokens", poolTokens > 0n, `${Number(formatEther(poolTokens)).toLocaleString()} GRAD`);
  ok("pool holds WETH", poolWeth > 0n, `${formatEther(poolWeth)} WETH`);

  // ── Liquidity is locked ──────────────────────────────────────────────────
  console.log("\n6. Liquidity is locked");
  ok(
    "no withdraw path exists on the launchpad",
    !Object.keys(pad.write).some((fn) =>
      /removeLiquidity|burn|collect|rescue|sweep/i.test(fn),
    ),
  );

  console.log(
    process.exitCode
      ? "\nSOMETHING FAILED."
      : "\nGraduation verified: the token now has a real Uniswap market.",
  );
}

main().catch((e) => {
  console.error(String(e).slice(0, 900));
  process.exitCode = 1;
});
