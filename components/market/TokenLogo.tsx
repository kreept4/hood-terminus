"use client";

import { useState } from "react";
import { clsx } from "@/lib/clsx";
import { knownTokenLogo, isFeatherStock } from "@/lib/launchpad/quotes";

/**
 * A token's artwork, or a stand-in for it.
 *
 * Most tokens on this chain are days old and have no logo at all, so the
 * fallback is the common case rather than the exception and has to look
 * deliberate. It is the ticker's first two characters on a tile whose colour is
 * derived from the contract address.
 *
 * Derived, not random: the same token gets the same colour on every render, on
 * every device, forever. That makes the placeholder function as an identifier
 * in a list rather than as decoration, which is most of what a logo is for when
 * scanning a column of rows.
 *
 * A plain `img` rather than next/image: these are 24 to 40 pixels, they come
 * from a host that already serves them at a sensible size, and routing them
 * through the optimiser would add a config entry and a round trip to save
 * nothing.
 */
export function TokenLogo({
  symbol,
  address,
  src,
  size = 28,
  className,
}: {
  symbol: string;
  /** Seeds the fallback colour. Any stable string works. */
  address: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);

  /**
   * Our own mark wins over the feed's.
   *
   * The feed hands back Robinhood's feather for every tokenised stock on this
   * chain, so NVDA, META and SPCX arrived indistinguishable. Where we hold the
   * real company mark it is used instead, and everything else is unaffected.
   *
   * The symbol is passed as well as the address because one asset on this
   * chain cannot be told apart by address at all: the feed reports WETH at the
   * zero address, which is also native ether's. See `knownTokenLogo`.
   */
  // A Robinhood stock we have no real mark for drops the feed's feather and
  // falls to the monogram: a rival brand's logo is worse than none.
  const preferred =
    knownTokenLogo(address, symbol) ?? (isFeatherStock(address) ? null : src);

  if (preferred && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={preferred}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setBroken(true)}
        className={clsx(
          "shrink-0 rounded-full bg-surface-2 object-cover",
          className,
        )}
        style={{ width: size, height: size }}
      />
    );
  }

  const { bg, fg } = colours(address);
  const label = symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();

  return (
    <span
      aria-hidden="true"
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
        fontSize: Math.max(9, Math.round(size * 0.36)),
        letterSpacing: "-0.02em",
      }}
    >
      {label || "?"}
    </span>
  );
}

/**
 * A stable colour per address.
 *
 * Hue from the hash, then lightness pinned low and chroma modest so every tile
 * sits at the same weight in a list. Picking hue freely but fixing the other
 * two is what keeps a column of these from looking like confetti.
 */
function colours(seed: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return {
    bg: `oklch(0.32 0.09 ${hue})`,
    fg: `oklch(0.92 0.06 ${hue})`,
  };
}
