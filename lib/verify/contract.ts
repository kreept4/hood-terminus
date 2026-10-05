import "server-only";
import {
  getAddress,
  parseAbi,
  toFunctionSelector,
  type Address,
  type Hex,
} from "viem";
import { verifyClient } from "./client";

/**
 * What the token contract itself allows.
 *
 * Read from the bytecode, so it works for any token whether or not its source
 * is published. A function selector compiled into the dispatcher means the
 * function exists. That is a capability, not proof it will be abused, so every
 * finding is paired with who can use it: a power behind a renounced owner is
 * inert, the same power behind a live owner is a switch someone holds.
 */

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";

/** ERC-1967 slots: implementation, admin, beacon. */
const SLOT_IMPL = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const SLOT_ADMIN = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const SLOT_BEACON = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";

/** ERC-1167 minimal proxy: prefix, 20-byte target, suffix. */
const CLONE_PREFIX = "363d3d373d3d3d363d73";

export type Power = "mint" | "blacklist" | "pause" | "fees" | "limits" | "trading" | "upgrade";

const POWER_SIGNATURES: Record<Power, string[]> = {
  mint: ["mint(address,uint256)", "mint(uint256)", "mintTo(address,uint256)"],
  blacklist: [
    "blacklist(address)",
    "blacklist(address,bool)",
    "addToBlacklist(address)",
    "addBlacklist(address)",
    "setBlacklist(address,bool)",
    "blacklistAddress(address,bool)",
    "blockAddress(address)",
    "setBots(address[],bool)",
    "addBots(address[])",
    "setBot(address,bool)",
    "freeze(address)",
  ],
  pause: ["pause()", "setPaused(bool)"],
  fees: [
    "setFee(uint256)",
    "setFees(uint256,uint256)",
    "setTax(uint256)",
    "setTaxes(uint256,uint256)",
    "setBuyTax(uint256)",
    "setSellTax(uint256)",
    "setBuyFee(uint256)",
    "setSellFee(uint256)",
    "setTaxFee(uint256)",
    "updateFees(uint256,uint256)",
    "setFeePercent(uint256)",
  ],
  limits: [
    "setMaxTxAmount(uint256)",
    "setMaxTxPercent(uint256)",
    "setMaxWallet(uint256)",
    "setMaxWalletSize(uint256)",
    "updateMaxTxnAmount(uint256)",
  ],
  trading: ["setTradingEnabled(bool)", "enableTrading(bool)", "setTrading(bool)"],
  upgrade: ["upgradeTo(address)", "upgradeToAndCall(address,bytes)"],
};

/** Selectors as they appear in bytecode: PUSH4 (0x63) followed by the four bytes. */
const POWER_PATTERNS: [Power, string[]][] = (
  Object.entries(POWER_SIGNATURES) as [Power, string[]][]
).map(([power, sigs]) => [power, sigs.map((s) => "63" + toFunctionSelector(s).slice(2))]);

function powersIn(code: Hex): Power[] {
  const hex = code.toLowerCase();
  return POWER_PATTERNS.filter(([, patterns]) => patterns.some((p) => hex.includes(p))).map(
    ([power]) => power,
  );
}

const slotAddress = (word: Hex | undefined): Address | null => {
  if (!word || /^0x0*$/.test(word)) return null;
  return getAddress(`0x${word.slice(-40)}`);
};

const OWNER_ABI = parseAbi([
  "function owner() view returns (address)",
  "function getOwner() view returns (address)",
]);

export type ContractFacts = {
  isContract: boolean;
  /** Where the logic lives when the token is a proxy, else null. */
  implementation: Address | null;
  /** Who can replace the logic: an ERC-1967 admin, or the owner for UUPS. */
  upgradeAdmin: Address | null;
  proxyKind: "erc1967" | "beacon" | "clone" | null;
  /** Null when the contract has no owner function at all. */
  owner: Address | null;
  ownerRenounced: boolean;
  hasOwnerFunction: boolean;
  powers: Power[];
};

export async function readContractFacts(token: Address): Promise<ContractFacts> {
  const client = verifyClient();
  const code = (await client.getCode({ address: token })) ?? "0x";

  const facts: ContractFacts = {
    isContract: code !== "0x",
    implementation: null,
    upgradeAdmin: null,
    proxyKind: null,
    owner: null,
    ownerRenounced: false,
    hasOwnerFunction: false,
    powers: [],
  };
  if (!facts.isContract) return facts;

  // Logic may live elsewhere. Scan whatever actually runs.
  let logic: Hex = code;
  const lower = code.toLowerCase();
  const cloneAt = lower.indexOf(CLONE_PREFIX);
  if (cloneAt >= 0 && cloneAt <= 4) {
    const target = getAddress(`0x${lower.slice(cloneAt + CLONE_PREFIX.length, cloneAt + CLONE_PREFIX.length + 40)}`);
    facts.implementation = target;
    facts.proxyKind = "clone";
    logic = (await client.getCode({ address: target })) ?? code;
  } else {
    const [impl, admin, beacon] = await Promise.all([
      client.getStorageAt({ address: token, slot: SLOT_IMPL }),
      client.getStorageAt({ address: token, slot: SLOT_ADMIN }),
      client.getStorageAt({ address: token, slot: SLOT_BEACON }),
    ]);
    const implAddr = slotAddress(impl);
    const beaconAddr = slotAddress(beacon);
    if (implAddr) {
      facts.implementation = implAddr;
      facts.proxyKind = "erc1967";
      facts.upgradeAdmin = slotAddress(admin);
      logic = (await client.getCode({ address: implAddr })) ?? code;
    } else if (beaconAddr) {
      facts.proxyKind = "beacon";
      facts.upgradeAdmin = beaconAddr;
    }
  }

  facts.powers = powersIn(logic);

  // Ownable, or the BEP-20 style getOwner. Either may be missing entirely.
  for (const functionName of ["owner", "getOwner"] as const) {
    try {
      const owner = await client.readContract({ address: token, abi: OWNER_ABI, functionName });
      facts.hasOwnerFunction = true;
      facts.owner = owner;
      facts.ownerRenounced = owner.toLowerCase() === ZERO || owner.toLowerCase() === DEAD;
      break;
    } catch {
      // try the next shape
    }
  }

  // A UUPS proxy upgrades through the implementation, gated by the owner.
  if (facts.proxyKind === "erc1967" && !facts.upgradeAdmin && facts.powers.includes("upgrade")) {
    facts.upgradeAdmin = facts.ownerRenounced ? null : facts.owner;
  }

  return facts;
}

export const POWER_WORDS: Record<Power, string> = {
  mint: "mint new tokens",
  blacklist: "block wallets from trading",
  pause: "pause all transfers",
  fees: "change the buy and sell tax",
  limits: "cap how much a wallet can buy or hold",
  trading: "switch trading off",
  upgrade: "replace the contract's code",
};
