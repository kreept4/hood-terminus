import { clsx } from "@/lib/clsx";
import { formatPercent } from "@/lib/format";

type Props = {
  /** Percentage change. Null renders as unavailable, never as zero. */
  value: number | null | undefined;
  digits?: number;
  ch?: number;
  size?: "sm" | "md" | "lg";
  /** Adds a directional caret. Off in dense tables where the sign is enough. */
  arrow?: boolean;
  className?: string;
};

const SIZES = {
  sm: "text-micro",
  md: "text-body",
  lg: "text-lead",
} as const;

/**
 * The only component permitted to use the up and down tokens. Market direction
 * is the one thing those colours mean, anywhere in the product.
 *
 * Direction is always carried by the sign as well as the colour, so the value
 * still reads correctly to a colour-blind trader and in a greyscale screenshot.
 */
export function Delta({
  value,
  digits = 2,
  ch,
  size = "md",
  arrow = false,
  className,
}: Props) {
  const unavailable =
    value === null || value === undefined || !Number.isFinite(value);

  const tone = unavailable
    ? "text-ink-3"
    : value > 0
      ? "text-green"
      : value < 0
        ? "text-red"
        : "text-ink-2";

  return (
    <span
      className={clsx("tnum inline-block", SIZES[size], tone, className)}
      style={ch ? { minWidth: `${ch}ch` } : undefined}
    >
      {arrow && !unavailable && value !== 0 ? (value > 0 ? "▲ " : "▼ ") : null}
      {formatPercent(value, digits)}
    </span>
  );
}
