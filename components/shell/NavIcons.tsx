/**
 * Nav icons.
 *
 * Drawn rather than pulled from a set, because seven glyphs do not justify a
 * dependency and a set would bring its own stroke weight and grid to argue with
 * the rest of the interface.
 *
 * All on a 16 unit box at 1.4 stroke, so the collapsed rail reads as one row of
 * marks rather than seven drawings of different densities. The collapsed rail
 * previously showed initials, which made a reader decode "T" twice.
 */

type IconProps = { className?: string };

function Svg({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Tokens: a sorted list, which is what a screener is. */
export function IconTokens({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M2.5 4h11M2.5 8h8M2.5 12h5" />
    </Svg>
  );
}

/** New pairs: a spark, for something that just appeared. */
export function IconNew({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M8 1.8v3M8 11.2v3M1.8 8h3M11.2 8h3M3.9 3.9l2 2M10.1 10.1l2 2M12.1 3.9l-2 2M5.9 10.1l-2 2" />
    </Svg>
  );
}

/** Trending: a line going up, and nothing else. */
export function IconTrending({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M2 11.5l3.6-3.8 2.5 2.2L14 4" />
      <path d="M10.4 4H14v3.4" />
    </Svg>
  );
}

/** Wallets. */
export function IconWallet({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="1.9" y="3.6" width="12.2" height="9" rx="2" />
      <path d="M10.6 8.1h3.5" />
    </Svg>
  );
}

/** Portfolio: holdings, stacked. */
export function IconPortfolio({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="2" y="8.5" width="3.2" height="5.5" rx="1" />
      <rect x="6.4" y="5.5" width="3.2" height="8.5" rx="1" />
      <rect x="10.8" y="2.4" width="3.2" height="11.6" rx="1" />
    </Svg>
  );
}

/** Alerts. */
export function IconAlerts({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 6.7a4 4 0 0 1 8 0c0 3 1.1 4.1 1.1 4.1H2.9S4 9.7 4 6.7Z" />
      <path d="M6.6 13a1.6 1.6 0 0 0 2.8 0" />
    </Svg>
  );
}

/** Trade: two directions. */
export function IconTrade({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3.4 5.4h9.2M10.1 2.9l2.5 2.5" />
      <path d="M12.6 10.6H3.4M5.9 8.1l-2.5 2.5" />
    </Svg>
  );
}

/** Leaves the product. Used wherever a link opens a block explorer. */
export function IconExternal({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9.4 2.6H13.4V6.6" />
      <path d="M13.4 2.6 7.2 8.8" />
      <path d="M11.7 9.3v3.1a1.6 1.6 0 0 1-1.6 1.6H3.6A1.6 1.6 0 0 1 2 12.4V5.9a1.6 1.6 0 0 1 1.6-1.6h3.1" />
    </Svg>
  );
}

/** Track wallets: a reticle. Watching a specific thing, not browsing. */
export function IconTrack({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="8" cy="8" r="5.4" />
      <circle cx="8" cy="8" r="1.6" />
      <path d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1" />
    </Svg>
  );
}
