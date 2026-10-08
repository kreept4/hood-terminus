import { clsx } from "@/lib/clsx";

export type ChipTone = "pass" | "fail" | "unknown" | "neutral" | "info";

const TONES: Record<ChipTone, string> = {
  pass: "text-green border-green-line bg-green-deep",
  fail: "text-red border-red-line bg-red-deep",
  /**
   * Unknown is amber and says UNKNOWN. It is never rounded up to a pass.
   *
   * It used to carry the green pass classes, which is the one thing this chip
   * must never do: a check that could not run rendered identically to one that
   * passed, so an unanswered question about a token looked like a cleared one.
   * The comment said amber the whole time; the palette had no amber until now.
   */
  unknown: "text-amber border-amber-line bg-amber-deep",
  neutral: "text-ink-2 border-line bg-surface-2",
  info: "text-info border-line bg-surface-2",
};

export function Chip({
  tone = "neutral",
  children,
  title,
  className,
}: {
  tone?: ChipTone;
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={clsx(
        "inline-block whitespace-nowrap rounded-xs border px-1.5 py-[1px]",
        "text-micro align-middle",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
