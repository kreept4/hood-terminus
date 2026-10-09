"use client";

import Link from "next/link";
import { HeroParallax } from "@/components/visual/HeroParallax";
import { PixelReveal } from "@/components/visual/PixelReveal";
import { useAssistantName } from "@/lib/assistant";

/**
 * The hero.
 *
 * Plain statements only. Nothing here asks the reader a question or implies
 * something it does not say: somebody arriving on a trading product has money
 * at stake and no patience for working out what a sentence meant.
 *
 * The most important sentence is the one about money. A tool that says it
 * "buys and sells a token for you" sounds like it spends your funds, and that
 * reading would stop people using the one feature this product is built
 * around. So it says what actually happens, in order: it is a test, it runs on
 * a copy, your wallet is not used, nothing is bought.
 *
 * Full height, and sized so the text fits a 390px screen without scrolling
 * inside the section.
 */
export function Hero() {
  const assistant = useAssistantName();

  return (
    <section className="gutter flex min-h-dvh flex-col justify-center py-16">
      <HeroParallax className="max-w-3xl">
        <h1 className="text-h1 leading-none font-bold tracking-tight text-ink md:text-display">
          <PixelReveal className="block">
            Check a token before you buy it
          </PixelReveal>
        </h1>

        <p className="mt-5 max-w-xl text-body text-ink-2 md:text-lead">
          {assistant} tests whether a token can be sold again, so you find out
          before you buy instead of after.
        </p>

        {/* The money sentence, set apart because it is the one people need to
            read. Four short statements, each answering a question somebody
            would otherwise have to ask. */}
        <div className="mt-6 max-w-xl rounded-md border border-line bg-surface-2 px-4 py-3">
          <p className="text-body text-ink">
            {assistant} does not use your money.
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-micro text-ink-2">
            <li>The test runs on a copy of the blockchain, not the real one.</li>
            <li>Your wallet is not connected to it and is never asked to sign.</li>
            <li>No token is bought, no token is sold, and no fee is paid.</li>
            <li>If a test cannot run, {assistant} says so instead of passing it.</li>
          </ul>
        </div>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/verify"
            className="inline-flex items-center justify-center rounded-md bg-green px-5 py-3 text-body font-semibold text-on-accent transition-opacity duration-100 hover:opacity-90"
          >
            Check a token
          </Link>
          <Link
            href="/create"
            className="inline-flex items-center justify-center rounded-md border border-green-line bg-green-deep px-5 py-3 text-body font-medium text-green transition-opacity duration-100 hover:opacity-90"
          >
            Launch a token
          </Link>
        </div>
      </HeroParallax>
    </section>
  );
}
