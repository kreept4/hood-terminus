import type { CheckStatus, Verdict } from "@/lib/verify/types";

/**
 * Colour for Verify's states.
 *
 * Four states, four treatments, and none of them borrows another's. Unknown is
 * deliberately not green: a check that could not run must never read as a pass
 * at a glance, so it stays neutral and says the word. Warn is amber, which now
 * comes from the palette rather than from a literal.
 *
 * `design/tokens.py` grew the ramp with the same WCAG assertions the other
 * ramps carry, so these are checked rather than chosen: amber reads 10.85 to 1
 * on the page ground and 8.16 to 1 on its own fill.
 */

export const STATUS_TONE: Record<CheckStatus, string> = {
  pass: "text-green border-green-line bg-green-deep",
  warn: "text-amber border-amber-line bg-amber-deep",
  fail: "text-red border-red-line bg-red-deep",
  unknown: "text-ink-2 border-line bg-surface-2",
};

export const STATUS_WORD: Record<CheckStatus, string> = {
  pass: "Pass",
  warn: "Warn",
  fail: "Fail",
  unknown: "Unknown",
};

export const VERDICT_TONE: Record<Verdict, string> = {
  clear: STATUS_TONE.pass,
  caution: STATUS_TONE.warn,
  danger: STATUS_TONE.fail,
  unknown: STATUS_TONE.unknown,
};

export const VERDICT_WORD: Record<Verdict, string> = {
  clear: "Clear",
  caution: "Caution",
  danger: "Danger",
  unknown: "Unknown",
};
