import { Suspense } from "react";
import { VerifyBox } from "@/components/verify/VerifyBox";

export const metadata = {
  title: "Verify a token",
  description:
    "Paste a token address and find out whether you could sell it. A real buy and sell is simulated through the token's own pool, on chain, without spending anything.",
};

/**
 * Verify, as its own page.
 *
 * The panel on a token page answers the question for a token somebody is
 * already looking at. This answers it for one they were sent: the commonest way
 * anybody meets a new token is an address pasted into a chat, and at that
 * moment they have no chart, no board and no reason to trust any of it.
 */
export default function VerifyPage() {
  return (
    <div className="gutter py-8 md:py-10">
      <header className="max-w-2xl">
        <h1 className="text-h1 leading-none font-bold tracking-tight text-ink">
          Check a token
        </h1>
        <p className="mt-4 text-body text-ink-2 md:text-lead">
          Paste a token address. The test tries to sell the token and reports
          what happened, so you find out whether you could get out before you
          put money in.
        </p>
        <p className="mt-3 text-micro text-ink-3">
          The test runs on a copy of the blockchain. Your money is not used,
          your wallet is not connected to it, and nothing is bought or sold.
        </p>
      </header>

      <Suspense fallback={<div className="mt-8 h-12" />}>
        <VerifyBox />
      </Suspense>
    </div>
  );
}
