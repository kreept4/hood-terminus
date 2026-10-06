import Link from "next/link";
import { HeroParallax } from "@/components/visual/HeroParallax";
import { PixelReveal } from "@/components/visual/PixelReveal";

/**
 * The hero.
 *
 * A claim and one button, and no figures.
 *
 * It carried a row of four, and `ChainStats` directly below it carried the same
 * three plus one more. Two of everything on one screen does not read as
 * thoroughness, it reads as a page that does not know what it holds. The row
 * below survived because it refreshes on its own.
 *
 * Dropping them also took the two upstream fetches with it, which is a real
 * saving on a rate-limited free tier rather than a tidy-up.
 */
export function Hero() {
  return (
    <section className="gutter flex min-h-dvh flex-col justify-center py-16">
      <HeroParallax className="max-w-3xl">
        <h1 className="text-display leading-none font-bold tracking-tight text-ink">
          <PixelReveal className="block">
            Launch and trade on Robinhood Chain
          </PixelReveal>
        </h1>
        <p className="mt-5 max-w-xl text-lead text-ink-2">
          Launch a token with nothing up front and earn the fees it trades on.
          Watch every pair on the chain while you are here.
        </p>

        <div className="mt-7">
          <Link
            href="/create"
            className="inline-block rounded-md bg-green px-5 py-3 text-body font-semibold text-on-accent transition-opacity duration-100 hover:opacity-90"
          >
            Create a token
          </Link>
        </div>
      </HeroParallax>

      {/* The figures moved out of the hero to `ChainStats` below it.
          Both existed for a while and three of the four were the same number
          twice on one screen, which reads as the page not knowing what it
          holds. The one underneath refreshes on its own, so it is the one that
          survived. */}
    </section>
  );
}
