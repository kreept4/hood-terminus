"use client";

import { useAccount } from "wagmi";
import { Card } from "@/components/primitives/Card";
import { ConnectWallet } from "@/components/wallet/ConnectWallet";
import { HoldingsPanel } from "@/components/wallets/HoldingsPanel";
import { FundingBar } from "@/components/portfolio/FundingBar";

/**
 * The portfolio, for whichever wallet is connected.
 *
 * A thin client wrapper: the address only exists in the browser, so the page
 * around this stays a server component and only the part that needs the wallet
 * hydrates.
 */
export function ConnectedHoldings() {
  const { address, isConnected } = useAccount();

  if (!isConnected || !address) {
    return (
      <Card className="px-5 py-12">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-5 text-center">
          <p className="text-body text-ink-2">
            Connect a wallet to see what it holds on Robinhood Chain.
          </p>
          <ConnectWallet label="Connect a wallet" />
        </div>
      </Card>
    );
  }

  return (
    <>
      {/* Money first. What the wallet holds is the question people arrive with,
          and moving it in or out is what they came to do about it. */}
      <FundingBar />
      <HoldingsPanel address={address} />
    </>
  );
}
