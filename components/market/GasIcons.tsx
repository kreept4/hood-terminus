/**
 * Gas condition icons.
 *
 * Three states, three different drawings rather than one glyph recoloured. A
 * colour-only signal is a signal a colour-blind trader does not get and a
 * greyscale screenshot loses, so the shape has to carry the meaning on its own.
 *
 * All on a 20 unit box with matching optical weight, so swapping one for
 * another does not change how heavy the row looks.
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
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

/**
 * Cheap: a droplet falling, with a trail. Reads as "flowing freely" and, at a
 * glance, as the opposite of the flame.
 */
export function IconGasCheap({ className }: Props) {
  return (
    <Svg className={className}>
      <path
        d="M10 4.4c2.4 2.5 3.7 4.5 3.7 6.3a3.7 3.7 0 1 1-7.4 0c0-1.8 1.3-3.8 3.7-6.3Z"
        fill="currentColor"
        opacity="0.22"
      />
      <path
        d="M10 4.4c2.4 2.5 3.7 4.5 3.7 6.3a3.7 3.7 0 1 1-7.4 0c0-1.8 1.3-3.8 3.7-6.3Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      {/* The highlight that makes it read as liquid rather than as a leaf. */}
      <path
        d="M8.4 11.4a1.9 1.9 0 0 0 1.5 2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Normal: a level gauge sitting mid-scale. Neutral by construction. */
export function IconGasNormal({ className }: Props) {
  return (
    <Svg className={className}>
      <path
        d="M3.4 13.6a7.4 7.4 0 1 1 13.2 0"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      {/* Ticks, so the dial reads as a scale and not as an arch. */}
      <path
        d="M4.6 8.7l1.2.6M10 6.3v1.4M15.4 8.7l-1.2.6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* The needle, straight up: mid-scale. */}
      <path
        d="M10 13.4V9.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="10" cy="13.8" r="1.25" fill="currentColor" />
    </Svg>
  );
}

/**
 * Busy: the same dial with the needle swung right. One drawing family with the
 * normal state, so the difference between them is the reading rather than the
 * picture.
 */
export function IconGasBusy({ className }: Props) {
  return (
    <Svg className={className}>
      <path
        d="M3.4 13.6a7.4 7.4 0 1 1 13.2 0"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M4.6 8.7l1.2.6M10 6.3v1.4M15.4 8.7l-1.2.6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M10 13.4 13 10.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="10" cy="13.8" r="1.25" fill="currentColor" />
    </Svg>
  );
}

/**
 * Expensive: a flame. Two tongues rather than one, because a single teardrop
 * outline is the same shape as the droplet used for cheap, and the two states
 * have to be told apart at 16px without reading the colour.
 */
export function IconGasHot({ className }: Props) {
  return (
    <Svg className={className}>
      <path
        d="M11.1 2.6c.5 2-.3 3.3-1.6 4.6-1.5 1.5-3.2 3-3.2 5.5a5.7 5.7 0 0 0 11.4 0c0-3.4-2-5-3.4-6.6-.5 1-1.2 1.6-2 1.9.4-1.9.3-3.6-1.2-5.4Z"
        fill="currentColor"
        opacity="0.2"
      />
      <path
        d="M11.1 2.6c.5 2-.3 3.3-1.6 4.6-1.5 1.5-3.2 3-3.2 5.5a5.7 5.7 0 0 0 11.4 0c0-3.4-2-5-3.4-6.6-.5 1-1.2 1.6-2 1.9.4-1.9.3-3.6-1.2-5.4Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      {/* The inner tongue. */}
      <path
        d="M12 11.1c.9.9 1.3 1.6 1.3 2.4a1.9 1.9 0 0 1-3.8 0c0-.9.6-1.5 1.3-2.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
