/**
 * Single source of truth for the product name.
 *
 * Nothing else in the codebase hardcodes a name. Page titles, the nav mark,
 * metadata and the manifest all read from here, so changing it is a one-line
 * change rather than a find-and-replace.
 */
export const BRAND = {
  name: "Hood Terminus",
  /** Split for the centred wordmark, which sets the two halves differently. */
  nameParts: ["Hood", "Terminus"] as const,
  tagline: "Robinhood Chain",
  description:
    "Live token launches, wallet performance and trading on Robinhood Chain.",
} as const;
