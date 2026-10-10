import { robinhoodChain } from "@/lib/chain";

/**
 * What a new token may be paired against.
 *
 * The launchpad decides this on chain, not the app: `setQuote` is owner-only
 * and every launch checks the allowlist. This list is the presentation of that
 * decision, kept here so a label and a logo do not have to be invented at three
 * separate call sites.
 *
 * A pairing is not cosmetic. It sets what buyers spend, what sellers receive,
 * what the creator earns their fees in, and which market the token opens
 * against at graduation. Somebody choosing NVDA is choosing that their token
 * trades against a stock, which is the reason this chain is interesting.
 *
 * Every graduation below is roughly ten thousand dollars at the prices read on
 * 9 September 2026, so a curve is a comparable distance whichever asset it
 * paired against. `contracts/scripts/set-quotes.ts` writes the same figures on
 * chain and is the authority; this copy is what the form draws. If they
 * disagree, the contract wins and a launch will simply behave differently from
 * what the form implied.
 */
export type QuoteAsset = {
  /** `0x0…0` is the chain's native coin. */
  address: `0x${string}`;
  symbol: string;
  /** How the amounts on this pairing are denominated. */
  decimals: number;
  /**
   * The asset's real mark, self-hosted.
   *
   * Sourced deliberately, because the obvious sources are wrong. The chain's
   * market data listing serves Robinhood's own feather for every tokenised
   * stock on it, byte for byte, so NVDA and GME came back as the same image.
   * Uniswap's token list carries these tokens but no artwork for any of them.
   *
   * The company marks that do exist are kept in `public/pairs/` rather than
   * hotlinked, so a logo cannot disappear because somebody else's CDN moved.
   *
   * All six now have one. GameStop's and State Street's came from Wikimedia
   * Commons after the market data listing and Uniswap's token list both turned
   * out to carry nothing usable, and the tint below is now only a fallback for
   * a file that fails to load.
   */
  logo: string | null;

  /**
   * The colour that mark is drawn in.
   *
   * Doing the job the logos could not: making six choices tellable apart at a
   * glance. Each is near the asset's own brand so the association is not
   * arbitrary, which is what stops it reading as decoration.
   */
  tint: string;
  /**
   * What a curve must take in before it graduates, in this asset's own units.
   *
   * Mirrors what the contract holds. It is here as well because a progress bar
   * has to divide by something, and dividing every token by the ETH threshold
   * put a USDG token that had raised 800 of its 8,000 at 200% full.
   */
  graduation: number;
};

export const NATIVE = "0x0000000000000000000000000000000000000000" as const;

export const QUOTE_ASSETS: QuoteAsset[] = [
  {
    address: NATIVE,
    symbol: robinhoodChain.nativeCurrency.symbol,
    decimals: 18,
    logo: "/pairs/eth.svg",
    tint: "#8a8f98",
    graduation: 4,
  },
  {
    address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
    symbol: "USDG",
    decimals: 6,
    logo: "https://coin-images.coingecko.com/coins/images/51281/large/GDN_USDG_Token_200x200.png?1730484111",
    tint: "#3b8f5a",
    graduation: 10_000,
  },
  {
    address: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec",
    symbol: "NVDA",
    decimals: 18,
    logo: "/pairs/nvda.svg",
    tint: "#76b900",
    graduation: 45,
  },
  {
    address: "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea",
    symbol: "SPCX",
    decimals: 18,
    logo: "/pairs/spcx.svg",
    tint: "#5b6b8c",
    graduation: 70,
  },
  {
    address: "0xc0d6457c16cc70d6790dd43521c899c87ce02f35",
    symbol: "META",
    decimals: 18,
    logo: "/pairs/meta.svg",
    tint: "#0866ff",
    graduation: 15,
  },
  {
    address: "0x1b0e319c6a659f002271b69db8a7df2f911c153e",
    symbol: "GME",
    decimals: 18,
    logo: "/pairs/gme.svg",
    tint: "#e4002b",
    graduation: 500,
  },
  {
    address: "0x117cc2133c37b721f49de2a7a74833232b3b4c0c",
    symbol: "SPY",
    decimals: 18,
    logo: "/pairs/spy.svg",
    tint: "#c9a227",
    graduation: 13,
  },
];

export function quoteAsset(address: string): QuoteAsset {
  const found = QUOTE_ASSETS.find(
    (q) => q.address.toLowerCase() === address.toLowerCase(),
  );
  return found ?? QUOTE_ASSETS[0];
}

/** The creator's own tax, capped where the contract caps it. */
export const MAX_CREATOR_TAX_PERCENT = 9;

/**
 * The creator's share of the 1% trade fee, as the chain is currently set.
 *
 * Only a fallback for the moment before the chain answers. The live figure is
 * read from `creatorShareBps`, because the owner can move it and this file
 * cannot know that they have. It is kept in step with the live value so the
 * flash before the read lands is not a different number from the one that
 * replaces it, which is worse than showing nothing: somebody reads 60, blinks,
 * and sees 80, and now neither figure is trustworthy.
 */
export const DEFAULT_CREATOR_SHARE_PERCENT = 80;

/**
 * Marks we trust more than the market feed's, keyed by token address.
 *
 * The feed serves Robinhood's own feather for every tokenised stock on this
 * chain, byte for byte, because Robinhood issues them. That is defensible from
 * their side and useless from ours: a screener where NVDA, GME, SPY and META
 * all wear the same logo has thrown away the only thing a logo is for.
 *
 * So where we have the real company mark, it wins over whatever the feed sent.
 * Everything else falls through to the feed, then to a monogram, unchanged.
 *
 * WETH gets its own mark rather than borrowing ether's. It is the same diamond
 * in magenta, which is how the rest of DeFi draws it, and the distinction is
 * load-bearing here: a token still on the curve trades against native ETH,
 * and a token that has graduated trades against WETH in a real pool. Drawing
 * both the same way hides the one state change in this product that matters
 * most, in the feed where people scan for it.
 *
 * Both spellings of native ETH are here too: the pairing catalogue keys it by
 * the zero address, and a portfolio row keys it by the literal "native",
 * because a balance held in the gas token has no contract to name. Neither had
 * an entry, which is why the gas row in a wallet was the one line still
 * wearing a monogram.
 */
export const KNOWN_TOKEN_LOGOS: Record<string, string> = {
  // WETH on Robinhood Chain. The pairing every graduated pool is built on.
  "0x0bd7d308f8e1639fab988df18a8011f41eacad73": "/pairs/weth.svg",
  // Native ETH, under both names it goes by in this codebase.
  "0x0000000000000000000000000000000000000000": "/pairs/eth.svg",
  native: "/pairs/eth.svg",
  "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec": "/pairs/nvda.svg",
  "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea": "/pairs/spcx.svg",
  "0xc0d6457c16cc70d6790dd43521c899c87ce02f35": "/pairs/meta.svg",
  // Apple and Alphabet, two more Robinhood-issued stocks the feed serves the
  // feather for. The mark is white because this UI is dark only; a black Apple
  // would vanish on the tile.
  "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9": "/pairs/aapl.svg",
  "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3": "/pairs/googl.svg",
  "0xb1bf26c1d20ff267a4f93550d1e0d06ac40a114b": "/pairs/rivn.svg", // Rivian

  "0x5fc5360d0400a0fd4f2af552add042d716f1d168":
    "https://coin-images.coingecko.com/coins/images/51281/large/GDN_USDG_Token_200x200.png?1730484111",
  "0x1b0e319c6a659f002271b69db8a7df2f911c153e": "/pairs/gme.svg",
  "0x117cc2133c37b721f49de2a7a74833232b3b4c0c": "/pairs/spy.svg",
};

/**
 * Marks keyed by ticker, for the tokens whose address cannot identify them.
 *
 * WETH is the whole reason this exists. The market feed reports wrapped ether
 * on this chain at the zero address, which is the same address the pairing
 * catalogue above uses for *native* ether, because a coin with no contract has
 * no other address to be given. Two different assets therefore arrive under
 * one key, and the address map can only answer for one of them. It answered
 * for native ETH, so every WETH pair on the board wore ether's blue diamond.
 *
 * The distinction is not cosmetic here. A token still on the curve trades
 * against native ETH and a token that has graduated trades against WETH in a
 * real pool, so those two marks are how the single most important state change
 * in this product reads at a glance in the feed where people scan for it.
 *
 * Consulted only where the address map has nothing or would answer wrongly,
 * and deliberately tiny: a ticker is not unique on a permissionless chain, so
 * anything matched by symbol alone has to be an asset whose symbol nobody else
 * on this chain is credibly using.
 */
const LOGOS_BY_SYMBOL: Record<string, string> = {
  WETH: "/pairs/weth.svg",
};

/**
 * Robinhood stock tokens we do not yet have a real mark for.
 *
 * The feed serves Robinhood's own feather for every one of these, so leaving
 * them on the feed image shows a rival brand's logo, which is worse than none.
 * Listed here they fall through to the ticker monogram instead: not the
 * company's mark, but honest, until a real one is added to `KNOWN_TOKEN_LOGOS`
 * above and its address removed from here.
 */
export const FEATHER_STOCKS = new Set<string>([
  "0x8005d266423c7ea827372c9c864491e5786600ea", // LLY — Eli Lilly
  "0xd5f3879160bc7c32ebb4dc785f8a4f505888de68", // QQQ — Invesco QQQ
  "0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344", // USO — US Oil Fund
  "0x1d11f0496982706c5e14a514d4e79f2e6bde4516", // DJT — Trump Media
  "0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e", // GLD — SPDR Gold
]);

/** True when the feed's image for this token is the misleading feather. */
export function isFeatherStock(address: string | null | undefined): boolean {
  return !!address && FEATHER_STOCKS.has(address.toLowerCase());
}

/**
 * The mark we hold for a token, if we hold a better one than the feed.
 *
 * Symbol first, because it is the narrower claim: the map above holds only
 * tickers the address map is known to get wrong. Everything else falls through
 * to the address, then to the feed, then to a monogram.
 */
export function knownTokenLogo(
  address: string | null | undefined,
  symbol?: string | null,
): string | null {
  const bySymbol = symbol
    ? LOGOS_BY_SYMBOL[symbol.trim().toUpperCase()]
    : undefined;
  if (bySymbol) return bySymbol;

  if (!address) return null;
  return KNOWN_TOKEN_LOGOS[address.toLowerCase()] ?? null;
}
