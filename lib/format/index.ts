/**
 * Every number the user sees is formatted here and nowhere else.
 *
 * Two rules this module exists to enforce:
 *  1. A `number` never touches a token amount. Amounts arrive as bigint or as
 *     a decimal string and are converted for display only, at the last step.
 *  2. Display width is stable. A price ticking from 0.00041 to 0.00039 must
 *     not reflow the row it sits in.
 */

/**
 * The one thing every formatter returns when there is no value. A missing
 * number is shown as missing and never rounded down to zero, because a zero
 * price and an unknown price mean very different things to someone trading.
 */
export const NO_VALUE = "-";

const SUBSCRIPTS = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];

function toSubscript(n: number): string {
  return String(n)
    .split("")
    .map((d) => SUBSCRIPTS[Number(d)])
    .join("");
}

/**
 * Meme token prices routinely have six or more leading zeros. Writing them out
 * is unreadable and truncating them is wrong, so we use the notation traders
 * already read on other screeners: $0.0₆1234 means $0.0000001234.
 */
export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return NO_VALUE;
  }
  if (value === 0) return "$0";

  const abs = Math.abs(value);

  if (abs >= 1) {
    return `$${abs.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  if (abs >= 0.01) return `$${abs.toFixed(4)}`;
  if (abs >= 0.001) return `$${abs.toFixed(5)}`;

  // Count leading zeros after the decimal point.
  const exponent = Math.floor(Math.log10(abs));
  const leadingZeros = Math.abs(exponent) - 1;
  const significant = Math.round(abs * Math.pow(10, Math.abs(exponent) + 3));

  return `$0.0${toSubscript(leadingZeros)}${significant}`;
}

/** Compact USD, for market cap, liquidity and volume columns. */
export function formatUsd(
  value: number | null | undefined,
  opts: { compact?: boolean } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return NO_VALUE;
  }
  const { compact = true } = opts;
  const abs = Math.abs(value);

  if (!compact) {
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (abs >= 1) return `$${value.toFixed(0)}`;
  return `$${value.toFixed(2)}`;
}

/** Always signed, so direction survives a greyscale screenshot. */
export function formatPercent(
  value: number | null | undefined,
  digits = 2,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return NO_VALUE;
  }
  const sign = value > 0 ? "+" : value < 0 ? "" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return NO_VALUE;
  }
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

/**
 * Age, as a trader reads it. Fixed width per magnitude so a ticking age column
 * does not shift its neighbours.
 */
export function formatAge(since: Date | string | number): string {
  const then = new Date(since).getTime();
  if (!Number.isFinite(then)) return NO_VALUE;

  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

/** Holding duration, for wallet profiles. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return NO_VALUE;
  }
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

export function truncateAddress(address: string, chars = 4): string {
  if (!address || address.length < 2 * chars + 2) return address ?? "";
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

/**
 * Token amounts arrive as bigint. This is the only place they become a number,
 * and only for display.
 */
export function formatTokenAmount(
  raw: bigint,
  decimals: number,
  maxFractionDigits = 4,
): string {
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = abs % base;

  const fractionStr = fraction
    .toString()
    .padStart(decimals, "0")
    .slice(0, maxFractionDigits)
    .replace(/0+$/, "");

  const wholeStr = whole.toLocaleString("en-US");
  const sign = negative ? "-" : "";
  return fractionStr ? `${sign}${wholeStr}.${fractionStr}` : `${sign}${wholeStr}`;
}

/**
 * An amount in a paired asset, written the way that asset is usually counted.
 *
 * Pairings are counted in wildly different sizes: forty-five NVDA, five hundred
 * GME, four ETH, ten thousand USDG. A single decimal rule cannot serve all of
 * them, so this scales the precision to the magnitude and then drops the zeros
 * it does not need. Without that last step a whole-number threshold rendered as
 * "another 45.000 NVDA", which reads like a measurement rather than a quantity.
 *
 * A positive amount never rounds to a bare zero. Telling someone they hold none
 * of something they hold a little of is worse than an approximate symbol.
 */
export function formatQuoteAmount(value: number): string {
  if (!Number.isFinite(value)) return NO_VALUE;
  if (value === 0) return "0";

  const digits = value >= 1000 ? 0 : value >= 100 ? 1 : value >= 1 ? 2 : 4;
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return "<0.0001";

  return rounded.toLocaleString("en-US", { maximumFractionDigits: digits });
}
