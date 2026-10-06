"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { formatEther, parseEther, getAddress, type Address } from "viem";
import { Card } from "@/components/primitives/Card";
import {
  LAUNCHPAD_ABI,
  LAUNCHPAD_ADDRESS,
  isLaunchpadDeployed,
} from "@/lib/launchpad";
import { robinhoodChain } from "@/lib/chain";

/**
 * Changing the launch fee, without a private key in a shell.
 *
 * The fee has an owner-only setter, and until now the only way to reach it was
 * a Hardhat script reading `DEPLOYER_KEY` out of the environment. That worked
 * while the deploying key owned the launchpad. It stopped working the moment
 * ownership moved, and the fix it invited was worse than the problem: export
 * the new owner's private key, paste it into a terminal, and put it in shell
 * history and the process list. Ownership was moved *because* the first key had
 * been pasted around. Doing it again would undo the point of doing it.
 *
 * So the setter is here instead, signed by whichever wallet is connected. The
 * key never leaves the wallet.
 *
 * It renders for nobody else. `owner()` is read from the chain and compared
 * with the connected address, so this is not a hidden route or a password: a
 * visitor who finds it still cannot use it, because the contract would reject
 * the transaction. The check decides what is worth drawing, not what is
 * allowed.
 */
export function OwnerPanel() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enabled = isLaunchpadDeployed();

  const { data: owner } = useReadContract({
    address: LAUNCHPAD_ADDRESS as Address,
    abi: LAUNCHPAD_ABI,
    functionName: "owner",
    query: { enabled },
  });

  const { data: fee, refetch } = useReadContract({
    address: LAUNCHPAD_ADDRESS as Address,
    abi: LAUNCHPAD_ABI,
    functionName: "launchFee",
    query: { enabled },
  });

  const isOwner =
    typeof owner === "string" &&
    typeof address === "string" &&
    getAddress(owner) === getAddress(address);

  if (!enabled || !isOwner) return null;

  let wanted: bigint | null = null;
  try {
    wanted = next.trim() === "" ? null : parseEther(next.trim());
  } catch {
    wanted = null;
  }

  const current = typeof fee === "bigint" ? fee : null;
  const ready = wanted !== null && wanted !== current && !busy;

  async function save() {
    if (wanted === null) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await writeContractAsync({
        // Pinned. Without it wagmi builds the call for whatever chain the
        // wallet happens to be on, which sent a launchpad transaction to
        // Ethereum mainnet where the contract does not exist and the wallet
        // holds no gas. Naming the chain makes wagmi switch or fail loudly.
        chainId: robinhoodChain.id,
        address: LAUNCHPAD_ADDRESS as Address,
        abi: LAUNCHPAD_ABI,
        functionName: "setLaunchFee",
        args: [wanted],
      });
      await refetch();
      setNext("");
      setNote("Saved. The create form reads this on its next load.");
    } catch (e) {
      setError(
        e instanceof Error && /rejected|denied/i.test(e.message)
          ? "Cancelled in your wallet."
          : "The fee did not change.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-14 px-5 py-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="text-body font-semibold text-ink">Launch fee</p>
          <p className="tnum mt-1 text-lead font-semibold text-ink">
            {current === null ? "-" : `${formatEther(current)} ETH`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label="New launch fee in ETH"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="0.000444"
            inputMode="decimal"
            spellCheck={false}
            className="tnum w-40 rounded-md border border-line bg-surface-2 px-3 py-2.5 text-body text-ink placeholder:text-ink-3 focus:border-green focus:outline-none"
          />
          <button
            type="button"
            onClick={save}
            disabled={!ready}
            className="rounded-md bg-green px-4 py-2.5 text-body font-semibold text-on-accent transition-opacity duration-100 hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving" : "Set fee"}
          </button>
        </div>
      </div>

      {note && <p className="mt-3 text-micro text-green">{note}</p>}
      {error && <p className="mt-3 text-micro text-red">{error}</p>}
    </Card>
  );
}
