/**
 * Section icons.
 *
 * One per landing section, drawn on a 24 unit box at 1.5 stroke so they sit at
 * matching optical weight beside a display-size heading. Each is built from a
 * silhouette plus one interior detail: enough structure to be worth looking at,
 * few enough parts to stay legible when the heading is the thing being read.
 *
 * They are decorative. The heading beside each one already says what the
 * section is, so every one of these is `aria-hidden` at the call site.
 */

type Props = { className?: string };

function Svg({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

/**
 * Just launched: a rocket.
 *
 * The nose and body are one closed path so the silhouette reads at a glance;
 * the fins, the porthole and the exhaust are separate so it does not collapse
 * into a blob. The exhaust is three dashes of decreasing length, which is what
 * gives it direction without drawing a flame.
 */
export function IconRocket({ className }: Props) {
  return (
    <Svg className={className}>
      {/* Body and nose. */}
      <path d="M12 2.2c2.9 2.4 4.4 5.5 4.4 9.1 0 2-.5 3.8-1.4 5.4H9c-.9-1.6-1.4-3.4-1.4-5.4 0-3.6 1.5-6.7 4.4-9.1Z" />
      {/* Fins. */}
      <path d="M7.6 11.6 4.6 14a1.6 1.6 0 0 0-.6 1.2v3.1l3.6-2.3" />
      <path d="M16.4 11.6 19.4 14a1.6 1.6 0 0 1 .6 1.2v3.1l-3.6-2.3" />
      {/* Porthole. */}
      <circle cx="12" cy="9.4" r="2" />
      {/* Exhaust. */}
      <path d="M10.2 19.4v1.4M12 19.4v2.4M13.8 19.4v1.4" />
    </Svg>
  );
}

/**
 * Trending: a rising series with its own plot frame.
 *
 * The frame is what stops it reading as the generic arrow every product uses
 * for "up", and the marked points say it is a series rather than a direction.
 */
export function IconTrendingSection({ className }: Props) {
  return (
    <Svg className={className}>
      <path d="M3.2 3.2v15.4a2.2 2.2 0 0 0 2.2 2.2h15.4" />
      <path d="M6.6 15.6l3.6-4.2 3 2.4 5.4-6.2" />
      <path d="M15.2 7.6h3.4v3.4" />
      <circle cx="10.2" cy="11.4" r="1" fill="currentColor" stroke="none" />
      <circle cx="13.2" cy="13.8" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/**
 * Tokens: the screener.
 *
 * The same sorted list the nav uses, at this component's 24 unit scale rather
 * than the nav's 16. One idea should not have two drawings: a reader who sees
 * sliders in the heading and a list in the nav has no way to know they point
 * at the same place.
 */
export function IconScreener({ className }: Props) {
  return (
    <Svg className={className}>
      <path d="M3.75 6h16.5M3.75 12h12M3.75 18h7.5" />
    </Svg>
  );
}

/**
 * New pairs: the nav's spark, at this file's 24 unit scale.
 *
 * The rocket belongs to the curve section, where something is being launched.
 * A pair appearing on a DEX is not a launch, and reusing the rocket for both
 * made two different things look like one.
 */
export function IconNewSection({ className }: Props) {
  return (
    <Svg className={className}>
      <path d="M12 2.7v4.5M12 16.8v4.5M2.7 12h4.5M16.8 12h4.5" />
      <path d="M5.85 5.85l3 3M15.15 15.15l3 3M18.15 5.85l-3 3M8.85 15.15l-3 3" />
    </Svg>
  );
}
