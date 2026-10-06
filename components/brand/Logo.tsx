/**
 * The Hood Terminus mark.
 *
 * Stepped geometry with notched corners and a concentric aperture, drawn on a
 * 24-unit grid so every edge lands on a whole number and the mark stays crisp
 * at 18px in the nav.
 *
 * The notches sit on two opposing corners rather than four, and the centre
 * carries a horizon bar rather than a dot: the same geometry as the hero grid,
 * reduced to a glyph. It reads as a terminal window and as a plane receding to
 * a horizon.
 *
 * Drawn in the brand green by default rather than in `currentColor`. The mark
 * is the one place the accent is allowed to appear without meaning market
 * direction, and green is what ties the product to the chain it runs on.
 * Callers that need it to inherit a colour pass `className="text-current"`.
 */
export function Logo({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="Hood Terminus"
      className={className ?? "text-green"}
    >
      {/* One path, three rings, even-odd fill:
          outer stepped square (solid) -> aperture (hole) -> horizon (solid). */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7 3 H21 V17 H17 V21 H3 V7 H7 Z
           M8.5 8.5 H15.5 V15.5 H8.5 Z
           M10.4 11.1 H13.6 V12.9 H10.4 Z"
        fill="currentColor"
      />
    </svg>
  );
}
