"use client";

import { useState } from "react";
import { useBalance } from "wagmi";
import { formatEther } from "viem";
import { QrCode } from "@/components/wallet/QrCode";
import { robinhoodChain } from "@/lib/chain";
import { clsx } from "@/lib/clsx";

/**
 * How a new account gets funded.
 *
 * Signing in with an email removes the first wall and leaves the second one
 * standing: the wallet it creates is empty, and nothing on this site can be
 * bought without ETH sitting on chain 4663. Someone who signs in and finds no
 * way forward has been walked into a dead end, so this is the other half of
 * that feature rather than a nicety attached to it.
 *
 * There is no card on-ramp here and there should not be a pretend one. The
 * embedded wallet is an ordinary EVM address, which means the honest answer is
 * also the simple one: this is where to send it from. For this audience in
 * particular that send is usually a withdrawal from Robinhood itself.
 *
 * The balance reads live, so the moment a deposit lands the panel says so. It
 * is the only confirmation a first-time user gets that they did it right.
 */
export function DepositPanel({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const { data: balance } = useBalance({
    address: address as `0x${string}`,
    chainId: robinhoodChain.id,
    query: {
      // Short, because someone is watching this screen waiting for it to move.
      refetchInterval: 5_000,
    },
  });

  const funded = balance ? balance.value > 0n : false;

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked. The address is on screen in full to copy by hand.
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <QrCode value={address} size={200} />

      <div className="w-full">
        <p className="tnum rounded-md border border-line bg-surface-2 px-3 py-2.5 text-body break-all text-ink">
          {address}
        </p>
      </div>

      <button
        type="button"
        onClick={copy}
        className="w-full rounded-md border border-green-line bg-green-deep px-3 py-2.5 text-body font-medium text-green transition-opacity duration-100 hover:opacity-90"
      >
        {copied ? "Copied" : "Copy address"}
      </button>

      <div
        className={clsx(
          "w-full rounded-md border px-3 py-2.5 text-micro",
          funded
            ? "border-green-line bg-green-deep text-green"
            : "border-line-soft bg-surface-2 text-ink-3",
        )}
      >
        {funded
          ? `Funded. Balance ${Number(formatEther(balance!.value)).toFixed(5)} ETH.`
          : "Waiting for a deposit. This updates on its own."}
      </div>

      {/* Cut to the part that loses money if it is not said: the network. */}
      <p className="text-micro text-ink-3">
        ETH on {robinhoodChain.name} only. Other networks will not arrive.
      </p>
    </div>
  );
}
