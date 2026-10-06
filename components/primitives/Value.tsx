import { clsx } from "@/lib/clsx";

type Props = {
  children: React.ReactNode;
  /**
   * Reserve a fixed character width so a ticking value cannot reflow its row.
   * Set this on any column whose digits change while the user is looking at it.
   */
  ch?: number;
  align?: "left" | "right";
  muted?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZES = {
  sm: "text-micro",
  md: "text-body",
  lg: "text-lead",
} as const;

/**
 * Every number in the product renders through this. Tabular figures, so
 * columns align and a price going from 0.00041 to 0.00039 does not shift.
 */
export function Value({
  children,
  ch,
  align = "left",
  muted = false,
  size = "md",
  className,
}: Props) {
  return (
    <span
      className={clsx(
        "tnum inline-block",
        SIZES[size],
        align === "right" && "text-right",
        muted ? "text-ink-3" : "text-ink",
        className,
      )}
      style={ch ? { minWidth: `${ch}ch` } : undefined}
    >
      {children}
    </span>
  );
}
