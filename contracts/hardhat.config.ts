import type { HardhatUserConfig } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Loads the repo's .env.local into process.env.
 *
 * The keys live one directory up because the app needs them too, and Hardhat
 * reads nothing but process.env. Without this every command is prefixed by hand
 * with the key on the command line, which puts it in shell history and in the
 * process list. Reading the file keeps it in the file.
 *
 * Found by walking up from the working directory rather than from `__dirname`.
 * This package is `"type": "module"`, so `__dirname` does not exist here: the
 * previous version referenced it inside the same `try` that guarded the file
 * read, so the ReferenceError was caught and skipped, every variable stayed
 * unset, and the scripts reported it as a missing key in `.env.local`. The file
 * was there the whole time. Walking up needs neither `__dirname` nor
 * `import.meta`, so it cannot break the same way again, and it works whether
 * the command is run from the repo root, from here, or from a subdirectory.
 *
 * Existing environment variables win, so a value set for one command still
 * overrides the file.
 */
function loadEnv(): void {
  let dir = process.cwd();

  for (let up = 0; up < 5; up++) {
    let found = false;

    for (const file of [".env.local", ".env"]) {
      let text: string;
      try {
        text = readFileSync(resolve(dir, file), "utf8");
      } catch {
        // Not at this level. Only a missing file is expected here.
        continue;
      }
      found = true;

      for (const line of text.split(/\r?\n/)) {
        const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
        if (!match) continue;
        const key = match[1];
        if (process.env[key] !== undefined) continue;
        process.env[key] = match[2].trim().replace(/^['"]|['"]$/g, "");
      }
    }

    if (found) return;

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  console.warn(
    "[hardhat] No .env.local found walking up from " + process.cwd() + ".",
  );
}

loadEnv();

/**
 * Hardhat, not Foundry.
 *
 * Foundry would be the call on merit: its invariant runner is the right tool
 * for a bonding curve holding other people's ETH. It officially wants WSL on
 * Windows, which is not installed here, and fighting a toolchain while writing
 * contracts that hold money is the wrong trade.
 *
 * Hardhat 3 closes most of the gap. It runs Solidity tests, compiles through a
 * Rust pipeline, and installs as a plain npm dependency on the Node toolchain
 * this repo already uses. The Solidity tests are written against forge-std, so
 * they port to Foundry unchanged if this ever moves.
 */

/**
 * The deployer key, checked before Hardhat sees it.
 *
 * Hardhat validates accounts while loading the config, so a malformed key
 * fails with a schema error naming a config path rather than the real problem,
 * which is almost always a stray quote or a trailing space picked up from a
 * shell.
 *
 * Anything that is not a 32-byte hex key is treated as absent. That turns
 * "invalid config" into "no account", which the deploy script already reports
 * in plain words.
 */
function deployerAccounts(): string[] {
  const raw = process.env.DEPLOYER_KEY?.trim().replace(/^['"]|['"]$/g, "");
  if (!raw) return [];

  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    console.warn("");
    console.warn("[hardhat] DEPLOYER_KEY is set but is not a valid key.");
    console.warn(
      `          Got ${key.length} characters; a key is 66 including the 0x.`,
    );
    console.warn("          Check for quotes or spaces around the value.");
    console.warn("");
    return [];
  }
  return [key];
}

const config: HardhatUserConfig = {
  // Hardhat 3 does not register a plugin just because it was imported. Without
  // this the connection object has no `viem`, and every script fails with an
  // undefined property rather than anything that names the cause.
  plugins: [hardhatToolboxViem],

  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          /**
           * Tuned for deploy size, not runtime gas.
           *
           * `runs: 1_000_000` is the better setting on merit: it optimises for
           * a contract called constantly, which this is, at the cost of a
           * larger deployment. It produced 2,620,747 gas of deployment, and
           * the deployer could not afford that on a chain whose gas price
           * moves twenty percent between attempts.
           *
           * A contract that cannot be deployed has no runtime to optimise.
           * 200 cuts deployment by 28 percent for a few thousand gas more per
           * trade, which is the correct trade at this moment and reversible
           * later by redeploying from a funded wallet.
           */
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
        },
      },
    },
  },

  networks: {
    /**
     * Mainnet, forked locally.
     *
     * The rehearsal before spending real money. Real chain state, real
     * contracts, funny money: a full launch, buy, sell and withdraw can be
     * exercised without a faucet and without anything being permanent.
     */
    forked: {
      type: "edr-simulated",
      chainId: 4663,
      forking: {
        url:
          process.env.ALCHEMY_HTTPS_URL ??
          "https://rpc.mainnet.chain.robinhood.com",
        /**
         * Pinned, so the fork is cacheable.
         *
         * An unpinned fork follows the chain head, and a moving head means
         * every run is a cache miss: the simulator re-fetches each account,
         * slot and contract it touches, from a provider that meters requests.
         * A pinned block makes that state immutable, so Hardhat can keep it on
         * disk in `cache/` and the second run onward costs almost nothing.
         *
         * This burned through an Alchemy quota before it was pinned.
         *
         * The block is arbitrary and only needs to be recent enough that the
         * contracts under test exist at it, and far enough behind the head to
         * be past any reorg. Bump it when the chain state being tested against
         * matters; nothing here depends on it being current.
         */
        blockNumber: 55_500_000,
      },
    },

    robinhood: {
      type: "http",
      chainType: "generic",
      url:
        process.env.ALCHEMY_HTTPS_URL ??
        "https://rpc.mainnet.chain.robinhood.com",
      chainId: 4663,
      accounts: deployerAccounts(),
      /**
       * An explicit limit, so Hardhat never estimates.
       *
       * Arbitrum caps `eth_estimateGas` at what the sender can actually afford,
       * and Hardhat pads whatever it gets back before sending. On a wallet
       * funded to roughly the deployment cost, that padded figure lands above
       * the affordable ceiling and the node answers "contract creation code
       * storage out of gas", which reads like the contract is too big when the
       * real problem is arithmetic about the balance.
       *
       * The figure moves when the contract does. Adding graduation took the
       * Sized against a measurement, not an estimate. `scripts/measure-deploy.ts`
       * deploys onto the pinned fork and reports the gas the deployment
       * actually burned; version two most recently measured 2,951,098, almost
       * all of it the 200-gas-per-byte code deposit on 12,643 bytes of runtime.
       *
       * A limit below what a deployment needs does not warn. It runs out
       * partway through the code deposit, keeps the gas, and reports "contract
       * creation code storage out of gas", which reads like the contract is
       * too large when the real problem is this number.
       *
       * Still kept tight rather than generous. The limit is what the node
       * reserves up front, so a large one demands a balance the transaction
       * will never spend. At 3M the reservation was within six percent of the
       * whole balance, and a gas price that moved from 0.406 to 0.515 gwei
       * between attempts was enough to fail it. Unused gas is refunded either
       * way, so the cost of headroom is the reservation, not the spend.
       *
       * Re-measure whenever the contract grows.
       */
      gas: 3_300_000,
    },

    robinhoodTestnet: {
      type: "http",
      chainType: "generic",
      url: "https://rpc.testnet.chain.robinhood.com",
      chainId: 46630,
      accounts: deployerAccounts(),
    },
  },
};

export default config;
