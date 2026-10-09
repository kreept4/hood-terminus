"use client";

import Link from "next/link";
import { HeroField } from "@/components/visual/HeroField";
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
 * The most important sentence is the one about money. A tool described as
 * buying and selling a token for you sounds like it spends your funds, and that
 * reading alone would stop people using the feature this product is built
 * around. So the card says what actually happens, one fact per line.
 */
export function Hero() {
  const assistant = useAssistantName();

  return (
    <section className="relative flex min-h-dvh flex-col justify-center overflow-hidden py-16">
      {/* The dot field, scoped to this section rather than the whole page.

          `HeroField` is only the canvas, so the positioning lives here. Behind
          the content at z-0 and never interactive, so it cannot eat a tap meant
          for a button. The rail is inset on desktop so the field does not run
          under it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      >
        <HeroField />
      </div>

      <div className="gutter relative z-10">
        <HeroParallax className="max-w-3xl">
          {/* One line at every width.

              The size is fluid rather than stepped, because a headline that
              wraps at one breakpoint and not another is two different
              headlines. `clamp` keeps it on a single line from 390px up without
              a media query deciding where it breaks. */}
          <h1 className="leading-[1.05] font-bold tracking-tight text-ink">
            <PixelReveal className="block whitespace-nowrap text-[clamp(1.15rem,5.1vw,3.75rem)]">
              Check a token before you buy it
            </PixelReveal>
          </h1>

          <p className="mt-5 max-w-xl text-body text-ink-2 md:text-lead">
            {assistant} tests whether a token can be sold again, so you find out
            before you buy instead of after.
          </p>

          {/* Set apart because it is the one thing people have to read, and
              given the same surface treatment as every other card in the
              product rather than a shape invented for this page. */}
          <div className="panel mt-7 max-w-xl">
            <div className="border-b border-line-soft px-4 py-3">
              <p className="text-body font-medium text-ink">
                {assistant} does not use your money
              </p>
            </div>

            <ul className="divide-y divide-line-soft">
              {[
                "The test runs on a copy of the blockchain, not the real one.",
                "Your wallet is not connected to it and is never asked to sign.",
                "No token is bought, no token is sold, and no fee is paid.",
                `If a test cannot run, ${assistant} says so instead of passing it.`,
              ].map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-2.5 px-4 py-2.5 text-micro text-ink-2"
                >
                  <Tick />
                  <span className="min-w-0">{line}</span>
                </li>
              ))}
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
      </div>
    </section>
  );
}

/** Marks a statement as a fact about the product, not a feature claim. */
function Tick() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-[3px] shrink-0 text-green"
    >
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}
