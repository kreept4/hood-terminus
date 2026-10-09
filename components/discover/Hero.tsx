"use client";

import Link from "next/link";
import { HeroParallax } from "@/components/visual/HeroParallax";
import { PixelReveal } from "@/components/visual/PixelReveal";
import { useAssistantName } from "@/lib/assistant";

/**
 * The hero.
 *
 * It was removed, and it is back for a reason: a terminal with no opening
 * statement reads as a tool somebody has to already understand. What it is not
 * allowed to be is the version that was removed, which was `min-h-dvh` and put
 * a claim and a button where the chain should have been. On a 390px screen the
 * entire first view was marketing and the data began below the fold.
 *
 * So it keeps the old language, display type with the reveal and the parallax,
 * one claim, one action, and no figures, because `ChainStats` directly below
 * owns those and two of everything on one screen reads as a page that does not
 * know what it holds.
 *
 * What it does not keep is the height. It is sized to leave the board visible
 * on the first screen, which is the thing the removal was protecting.
 *
 * The claim itself is Travis, because that is the moat. Anyone can list pairs;
 * the product worth describing in one sentence is the one that tells you
 * whether you can get your money back out.
 */
export function Hero() {
  const assistant = useAssistantName();

  return (
    <section className="gutter pt-10 pb-8 md:pt-14 md:pb-10">
      <HeroParallax className="max-w-3xl">
        <h1 className="text-h1 leading-none font-bold tracking-tight text-ink md:text-display">
          <PixelReveal className="block">Can I sell it?</PixelReveal>
        </h1>

        <p className="mt-5 max-w-xl text-lead text-ink-2">
          {assistant} buys about ten dollars of a token and sells it straight
          back through its own pool before you commit a penny. Nothing is
          signed, nothing is spent, and a check that cannot run says so rather
          than passing.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            href="/verify"
            className="inline-block rounded-md bg-green px-5 py-3 text-body font-semibold text-on-accent transition-opacity duration-100 hover:opacity-90"
          >
            Ask {assistant} about a token
          </Link>
          <Link
            href="/create"
            className="inline-block rounded-md border border-green-line bg-green-deep px-5 py-3 text-body font-medium text-green transition-opacity duration-100 hover:opacity-90"
          >
            Launch a token
          </Link>
        </div>
      </HeroParallax>
    </section>
  );
}
