/**
 * Who a pair actually trades on.
 *
 * No server boundary here on purpose. This is a lookup table and some string
 * handling, and both a server page and a test need to name an exchange without
 * dragging in the market client.
 */

/**
 * Launchpads whose hooks are recognisable by the dex GeckoTerminal files the
 * pool under. Naming the launchpad tells a trader whose fee they are paying.
 */
export const LAUNCHPAD_DEXES: Record<string, string> = {
  "pons-v2-dex": "Pons",
  "bankr-robinhood": "Bankr",
  "clanker-robinhood": "Clanker",
  "virtuals-robinhood": "Virtuals",
  "easya-kickstart-robinhood": "EasyA Kickstart",
  "mint-club-robinhood": "Mint Club",
};

/**
 * A name for an exchange that can be read aloud.
 *
 * The launchpad names above are the good case. Everything else arrives as the
 * slug GeckoTerminal files it under, and "This pair trades on
 * uniswap-v4-robinhood" is not a sentence anybody should be shown. The chain
 * suffix goes, separators become spaces, and each word is capitalised, except
 * version markers, which are conventionally lowercase: v3, not V3.
 */
export function venueName(dex: string | null): string {
  if (!dex) return "another exchange";
  const launchpad = LAUNCHPAD_DEXES[dex];
  if (launchpad) return launchpad;

  return dex
    .replace(/-robinhood$/, "")
    .split("-")
    .map((word) =>
      /^v\d+$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}
