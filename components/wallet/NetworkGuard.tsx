"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { robinhoodChain } from "@/lib/chain";

/**
 * Says so when the wallet is pointed at the wrong chain.
 *
 * This is worth a permanent piece of the interface because of how the failure
 * presents. A wallet connected to Ethereum looks completely normal here: the
 * address shows, the boards render, the buttons are live. Nothing is wrong
 * until a transaction is signed, and then the wallet reports "not enough gas"
 * on an account that is well funded, because it is describing a balance on a
 * different chain entirely. The message is true and the conclusion it invites
 * is wrong, and someone can spend a long time topping up a wallet that was
 * never short.
 *
 * Every write in the app now names the chain, so wagmi asks the wallet to
 * switch rather than building the call for wherever it happens to be. This is
 * the other half of that: telling somebody before they press the button rather
 * than after.
 */
export function NetworkGuard() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected || chainId === robinhoodChain.id) return null;

  return (
    <div className="gutter pt-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-line bg-surface px-4 py-3">
        <p className="text-body text-ink">
          Your wallet is on the wrong network. Nothing here will work until it
          is on {robinhoodChain.name}.
        </p>
        <button
          type="button"
          onClick={() => switchChain({ chainId: robinhoodChain.id })}
          disabled={isPending}
          className="shrink-0 rounded-md bg-green px-4 py-2 text-body font-semibold text-on-accent transition-opacity duration-100 hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Switching" : `Switch to ${robinhoodChain.name}`}
        </button>
      </div>
    </div>
  );
}
