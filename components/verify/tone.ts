import type { CheckStatus, Verdict } from "@/lib/verify/types";

/**
 * Colour for Verify's states.
 *
 * Unknown is deliberately not green. A check that could not run must never
 * read as a pass at a glance, so it gets the neutral treatment and the word
 * UNKNOWN. Warn uses amber; the design tokens have no amber yet, so it falls
 * back to a literal until design/tokens.py grows one as --c-amber.
 */

const AMBER = "text-[var(--c-amber,#d9a441)] border-[var(--c-amber-line,#6b5320)] bg-[var(--c-amber-deep,#2a2110)]";

export const STATUS_TONE: Record<CheckStatus, string> = {
  pass: "text-green border-green-line bg-green-deep",
  warn: AMBER,
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
