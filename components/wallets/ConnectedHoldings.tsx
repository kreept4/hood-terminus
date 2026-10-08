"use client";

import { useAccount } from "wagmi";
import { Card } from "@/components/primitives/Card";
import { ConnectWallet } from "@/components/wallet/ConnectWallet";
import { useWalletAuth } from "@/lib/wallet/auth";
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
  const auth = useWalletAuth();

  if (!isConnected || !address) {
    /**
     * Already signed in, just with no wallet on the account.
     *
     * Offering "Sign in" here was telling somebody to do a thing they had
     * already done, beside a second button that did the thing they actually
     * needed. One instruction, one control.
     */
    const signedIn = Boolean(auth?.ready && auth?.authenticated);

    return (
      <Card className="px-5 py-12">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-5 text-center">
          <p className="text-body text-ink-2">
            {signedIn
              ? "No wallet on this account yet. Link one to see what it holds on Robinhood Chain."
              : "Sign in to see what your wallet holds on Robinhood Chain."}
          </p>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {!signedIn && <ConnectWallet signInOnly label="Sign in" />}
            <ConnectWallet walletOnly label="Link a wallet" />
          </div>
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
