"use client";

import { useState } from "react";
import { clsx } from "@/lib/clsx";
import { quoteAsset } from "@/lib/launchpad/quotes";

/**
 * The mark for a pairing.
 *
 * A pairing is the one choice on this launchpad that another one on this chain
 * cannot offer, so it is worth being recognisable rather than spelled. Nobody
 * reads "NVDA" as fast as they see Nvidia's green.
 *
 * Every pairing now carries its real company mark, held in `public/pairs/`
 * rather than hotlinked. The chain's own market feed was no help: Robinhood
 * issues all six tokenised stocks and the feed serves Robinhood's feather for
 * every one of them, byte for byte, which made the pairings indistinguishable.
 * The brand tint below is only the fallback for a file that fails to load.
 *
 * Two of those marks are wide wordmarks rather than icons, GameStop at roughly
 * five to one and SPDR at eight. They are stored pre-composed onto a square
 * tile, so the aspect ratio is settled in the file and every caller can treat
 * all six the same. Dropping a wordmark straight into a twenty-pixel circle
 * cropped it to the middle two letters of a word.
 */
export function QuoteLogo({
  quote,
  size = 20,
  className,
}: {
  quote: string;
  size?: number;
  className?: string;
}) {
  const asset = quoteAsset(quote);
  const [broken, setBroken] = useState(false);

  if (!asset.logo || broken) {
    return (
      <span
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * 0.42),
          backgroundColor: asset.tint,
        }}
        className={clsx(
          "flex shrink-0 items-center justify-center rounded-full",
          "font-bold text-white",
          className,
        )}
      >
        {asset.symbol.slice(0, 2)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={asset.logo}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setBroken(true)}
      style={{ width: size, height: size }}
      className={clsx("shrink-0 rounded-full object-cover", className)}
    />
  );
}
