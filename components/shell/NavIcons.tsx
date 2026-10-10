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
/**
 * Verify: a shield with a tick.
 *
 * The one mark in this set that names a guarantee rather than a place. A shield
 * alone reads as settings on half the apps that use it, and the tick is what
 * makes it a verdict.
 */
export function IconVerify({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M8 1.2 2.6 3.4v4.1c0 3.2 2.2 6 5.4 7.3 3.2-1.3 5.4-4.1 5.4-7.3V3.4z" />
      <path d="M5.9 7.9 7.4 9.4l2.9-3" />
    </Svg>
  );
}

export function IconTrack({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="8" cy="8" r="5.4" />
      <circle cx="8" cy="8" r="1.6" />
      <path d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1" />
    </Svg>
  );
}

/**
 * Settings: a gear, generated rather than drawn.
 *
 * The rest of this set is a few straight strokes, which can be eyeballed. A
 * gear cannot: its teeth have to sit at equal angles with matching flanks, and
 * a hand written path gets that subtly wrong in a way that reads as wobble at
 * 17px. `design/gear.py` computes the outline, so the shape is a consequence
 * of six numbers rather than of my patience. Re-run it to change the tooth
 * count or depth; do not edit the path by hand.
 */
export function IconSettings({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6.21 3.33L6.76 1.62L9.24 1.62L9.79 3.33L10.03 3.43L11.63 2.61L13.39 4.37L12.57 5.97L12.67 6.21L14.38 6.76L14.38 9.24L12.67 9.79L12.57 10.03L13.39 11.63L11.63 13.39L10.03 12.57L9.79 12.67L9.24 14.38L6.76 14.38L6.21 12.67L5.97 12.57L4.37 13.39L2.61 11.63L3.43 10.03L3.33 9.79L1.62 9.24L1.62 6.76L3.33 6.21L3.43 5.97L2.61 4.37L4.37 2.61L5.97 3.43Z" />
      <path d="M5.70 8.00A2.30 2.30 0 0 1 10.30 8.00A2.30 2.30 0 0 1 5.70 8.00Z" />
    </Svg>
  );
}