/**
 * Market data for Robinhood Chain.
 *
 * GeckoTerminal indexes chain 4663 under the network slug `robinhood`. It is
 * free, needs no key, and covers pools, prices, liquidity and OHLCV. That makes
 * it the only way this product shows real numbers before our own indexer
 * exists, and it stays useful afterwards as the source for candles.
 *
 * Server-side only. Every call is cached with an explicit TTL, because the
 * public tier is rate limited and Discover is the highest-traffic surface in
 * the product.
 */

const BASE = "https://api.geckoterminal.com/api/v2";
const NETWORK = "robinhood";

/** Shapes we actually read. The API returns more; we do not depend on it. */
type RawPool = {
  attributes: {
    address: string;
    name: string;
    base_token_price_usd: string | null;
    reserve_in_usd: string | null;
    fdv_usd: string | null;
    market_cap_usd: string | null;
    pool_created_at: string | null;
    price_change_percentage: Record<string, string | null>;
    volume_usd: Record<string, string | null>;
    transactions: Record<
      string,
      { buys?: number; sells?: number; buyers?: number; sellers?: number }
    >;
  };
  relationships?: {
    base_token?: { data?: { id?: string } };
    quote_token?: { data?: { id?: string } };
    dex?: { data?: { id?: string } };
  };
};

/**
 * The windows the screener works in.
 *
 * Four rather than six: GeckoTerminal only reports price change and volume for
 * these, and offering a timeframe the data cannot answer is worse than not
 * offering it.
 */
export const WINDOWS = ["5m", "1h", "6h", "24h"] as const;
export type Window = (typeof WINDOWS)[number];

export type Pool = {
  address: string;
  /** "CASHCAT / WETH 0.3%" */
  name: string;
  /** Base symbol only, split off the pair name. */
  symbol: string;
  quoteSymbol: string;
  baseTokenAddress: string | null;
  /**
   * The base token's artwork, when the upstream ships it alongside the pool.
   *
   * Comes from `include=base_token`, which costs nothing: the same request
   * that returns the pools returns the tokens. Fetching logos separately
   * would be one extra round trip per screen against a rate limited free
   * tier, to draw a 28 pixel circle.
   */
  imageUrl: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  /** Volume in USD, keyed by the same windows the screener offers. */
  volume: Record<Window, number | null>;
  volume24hUsd: number | null;
  /** Price change in percent, keyed by window. */
  change: Record<Window, number | null>;
  change5m: number | null;
  change1h: number | null;
  change24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  createdAt: string | null;
  /**
   * Which exchange the pool belongs to.
   *
   * Robinhood Chain carries at least eight: Uniswap V3 and V4, Pons, Bankr,
   * Ramses and others. They do not share an interface, so this decides whether
   * a pool can be quoted and routed, and it is not optional information.
   */
  dex: string | null;
};

/**
 * The exchanges this product can quote and route.
 *
 * Uniswap V3 and its forks, which share the pool interface the quote engine
 * reads: `slot0()`, `liquidity()`, `fee()`. Everything else on the chain either
 * answers a different interface or none at all, and offering a token that
 * cannot be routed is worse than not listing it.
 *
 * V4 is deliberately absent. Its pools are singleton positions inside a
 * PoolManager rather than contracts of their own, so nothing here reaches them
 * and pretending otherwise would produce a quote for a swap that cannot run.
 */
export const ROUTABLE_DEXES = new Set([
  "uniswap-v3-robinhood",
  "ramses-v3-robinhood",
  "up-v3",
]);

export function isRoutable(pool: Pool): boolean {
  return pool.dex !== null && ROUTABLE_DEXES.has(pool.dex);
}

export type Candle = {
  /** Unix seconds, as lightweight-charts expects. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function num(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Token ids come back as "robinhood_0xabc…". We only want the address. */
function addressFromId(id: string | undefined): string | null {
  if (!id) return null;
  const i = id.indexOf("_");
  return i === -1 ? id : id.slice(i + 1);
}

function normalise(raw: RawPool, images?: Map<string, string>): Pool {
  const a = raw.attributes;
  // "CASHCAT / WETH 0.3%" -> base "CASHCAT", quote "WETH"
  const [basePart = "", quotePart = ""] = a.name.split(" / ");
  const quoteSymbol = quotePart.split(" ")[0] ?? "";

  return {
    address: a.address,
    name: a.name,
    symbol: basePart.trim(),
    quoteSymbol,
    baseTokenAddress: addressFromId(raw.relationships?.base_token?.data?.id),
    imageUrl:
      images?.get(
        (addressFromId(raw.relationships?.base_token?.data?.id) ?? "").toLowerCase(),
      ) ?? null,
    priceUsd: num(a.base_token_price_usd),
    liquidityUsd: num(a.reserve_in_usd),
    marketCapUsd: num(a.market_cap_usd) ?? num(a.fdv_usd),
    volume: {
      "5m": num(a.volume_usd?.m5),
      "1h": num(a.volume_usd?.h1),
      "6h": num(a.volume_usd?.h6),
      "24h": num(a.volume_usd?.h24),
    },
    volume24hUsd: num(a.volume_usd?.h24),
    change: {
      "5m": num(a.price_change_percentage?.m5),
      "1h": num(a.price_change_percentage?.h1),
      "6h": num(a.price_change_percentage?.h6),
      "24h": num(a.price_change_percentage?.h24),
    },
    change5m: num(a.price_change_percentage?.m5),
    change1h: num(a.price_change_percentage?.h1),
    change24h: num(a.price_change_percentage?.h24),
    buys24h: a.transactions?.h24?.buys ?? null,
    sells24h: a.transactions?.h24?.sells ?? null,
    createdAt: a.pool_created_at,
    dex: raw.relationships?.dex?.data?.id ?? null,
  };
}

/**
 * One request at a time, spaced, with a single retry on a rate limit.
 *
 * GeckoTerminal's free tier does not police a rate so much as a burst. This
 * module fans out: the screener asks for three pages at once, the landing page
 * asks for those plus new and trending, and every one of those goes out in the
 * same instant on a cold cache. The first is answered and the rest come back
 * 429 with an empty body, which this file turns into `null` and the pages turn
 * into empty boards. Nothing errors. The screener is simply blank, and so is
 * the token picker on the alerts page, which is how it was noticed.
 *
 * Serialising costs a few hundred milliseconds on a cold render and is paid
 * once, because the results are cached by `revalidate` afterwards.
 */
const GAP_MS = 260;
let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;

function queued<T>(run: () => Promise<T>): Promise<T> {
  const next = chain.then(async () => {
    const since = Date.now() - lastAt;
    if (since < GAP_MS) {
      await new Promise((r) => setTimeout(r, GAP_MS - since));
    }
    lastAt = Date.now();
    return run();
  });
  // The queue must survive a failure, or one rejected request stops every
  // request that comes after it.
  chain = next.catch(() => undefined);
  return next;
}

async function get<T>(path: string, revalidate: number): Promise<T | null> {
  return queued(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${BASE}${path}`, {
          headers: { accept: "application/json" },
          next: { revalidate },
        });

        // The one status worth waiting out. Everything else is an answer.
        if (res.status === 429 && attempt === 0) {
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }

        if (!res.ok) return null;
        return (await res.json()) as T;
      } catch {
        // An upstream being unreachable is a normal state. The caller renders
        // an explicit unavailable panel rather than an error page.
        return null;
      }
    }
    return null;
  });
}

type IncludedToken = {
  type?: string;
  attributes?: { address?: string; image_url?: string | null };
};
type PoolList = { data?: RawPool[]; included?: IncludedToken[] };

/**
 * Logos out of an `included` block, by lowercase address.
 *
 * GeckoTerminal returns the string "missing.png" rather than omitting the
 * field when it has no artwork, so an unfiltered value renders a broken
 * image instead of falling through to the monogram.
 */
function imagesFrom(included: IncludedToken[] | undefined): Map<string, string> {
  const images = new Map<string, string>();
  for (const item of included ?? []) {
    if (item.type !== "token") continue;
    const address = item.attributes?.address?.toLowerCase();
    const url = item.attributes?.image_url;
    if (!address || !url || /missing/i.test(url)) continue;
    images.set(address, url);
  }
  return images;
}

export async function getTrendingPools(): Promise<Pool[]> {
  const json = await get<PoolList>(
    `/networks/${NETWORK}/trending_pools?page=1&include=base_token`,
    30,
  );
  return (json?.data ?? []).map((raw) => normalise(raw, imagesFrom(json?.included)));
}

/**
 * Newly created pools, newest first.
 *
 * Paged rather than taken as one call. GeckoTerminal returns twenty rows a
 * page, so a single request always reports exactly twenty new pairs whatever
 * the chain actually did, and a count that is really a page size is a number
 * that lies to the reader. Three pages is the whole recent window on a chain
 * this size and still only three cached requests.
 */
/**
 * Three pages, after five proved too greedy.
 *
 * Five was tried and put the landing page back into rate limiting: eleven
 * requests per render, serialised, and the single-request trending feed lost
 * every time. A board that is a hundred deep is worth nothing if the board
 * beside it is empty.
 *
 * Depth is no longer this function's job anyway. Our own index knows all 3,410
 * pools, so the feed only has to cover the ones worth pricing.
 */
export async function getNewPools(pages = 3): Promise<Pool[]> {
  const responses = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      get<PoolList>(`/networks/${NETWORK}/new_pools?page=${i + 1}&include=base_token`, 15),
    ),
  );

  const seen = new Set<string>();
  const out: Pool[] = [];
  for (const json of responses) {
    const images = imagesFrom(json?.included);
    for (const raw of json?.data ?? []) {
      const pool = normalise(raw, images);
      // Pages can overlap while new pools are being created underneath the
      // cursor, which would otherwise show the same pair twice.
      if (seen.has(pool.address)) continue;
      seen.add(pool.address);
      out.push(pool);
    }
  }
  return out;
}

/**
 * Top pools by 24h volume. Used as the population for the gainers and losers
 * boards, so a token with no real trading cannot top either list purely on a
 * percentage move.
 */
export async function getTopPools(pages = 3): Promise<Pool[]> {
  const responses = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      get<PoolList>(
        `/networks/${NETWORK}/pools?page=${i + 1}&sort=h24_volume_usd_desc&include=base_token`,
        30,
      ),
    ),
  );

  const seen = new Set<string>();
  const out: Pool[] = [];
  for (const json of responses) {
    const images = imagesFrom(json?.included);
    for (const raw of json?.data ?? []) {
      const pool = normalise(raw, images);
      if (seen.has(pool.address)) continue;
      seen.add(pool.address);
      out.push(pool);
    }
  }
  return out;
}

export async function getPool(address: string): Promise<Pool | null> {
  const json = await get<{ data?: RawPool }>(
    `/networks/${NETWORK}/pools/${address}?include=base_token`,
    15,
  );
  return json?.data ? normalise(json.data) : null;
}

/** A pool plus its base token's artwork. One extra cached request. */
export async function getPoolWithLogo(
  address: string,
): Promise<{ pool: Pool; logo: string | null } | null> {
  const pool = await getPool(address);
  if (!pool) return null;
  if (!pool.baseTokenAddress) return { pool, logo: null };

  const images = await getTokenImages([pool.baseTokenAddress]);
  return { pool, logo: images.get(pool.baseTokenAddress.toLowerCase()) ?? null };
}

/** Which pool is the primary market for a token. */
export async function getPoolsForToken(address: string): Promise<Pool[]> {
  const json = await get<PoolList>(
    `/networks/${NETWORK}/tokens/${address}/pools?page=1`,
    30,
  );
  return (json?.data ?? []).map((raw) => normalise(raw, imagesFrom(json?.included)));
}

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

/** GeckoTerminal splits timeframe and aggregate; the UI thinks in one label. */
const TF: Record<Timeframe, { path: string; aggregate: number }> = {
  "1m": { path: "minute", aggregate: 1 },
  "5m": { path: "minute", aggregate: 5 },
  "15m": { path: "minute", aggregate: 15 },
  "1h": { path: "hour", aggregate: 1 },
  "4h": { path: "hour", aggregate: 4 },
  "1d": { path: "day", aggregate: 1 },
};

export async function getCandles(
  poolAddress: string,
  timeframe: Timeframe,
  limit = 300,
): Promise<Candle[]> {
  const { path, aggregate } = TF[timeframe];
  const json = await get<{
    data?: { attributes?: { ohlcv_list?: number[][] } };
  }>(
    `/networks/${NETWORK}/pools/${poolAddress}/ohlcv/${path}?aggregate=${aggregate}&limit=${limit}`,
    timeframe === "1d" ? 300 : 20,
  );

  const list = json?.data?.attributes?.ohlcv_list ?? [];
  return (
    list
      .map(([time, open, high, low, close, volume]) => ({
        time,
        open,
        high,
        low,
        close,
        volume,
      }))
      // The API returns newest first; charting libraries want oldest first.
      .sort((a, b) => a.time - b.time)
  );
}

/**
 * The one function behind every board on Discover.
 *
 * Filtered by liquidity on purpose: a 4,000% move in a pool holding $80 is
 * noise, and putting it at the top of a board would be the fastest way to lose
 * a trader's trust. The floor is a filter the user sets rather than a constant,
 * because someone hunting brand new pairs genuinely does want to look lower
 * than someone sizing a position.
 *
 * Pools with no reading for the selected window are dropped rather than sorted
 * as zero. A pool that has not traded in five minutes has no five-minute move,
 * and showing it as 0.00% is a claim the data does not support.
 */
/**
 * A board. Some of these are orderings and some are feeds, and the screener
 * deliberately does not distinguish: to a reader "Trending" and "Gainers" are
 * the same kind of choice, and making one a tab and the other a whole section
 * of the page was an implementation detail leaking into the interface.
 */
export type ScreenSort =
  | "curve"
  | "trending"
  | "new"
  | "gainers"
  | "losers"
  | "volume"
  | "liquidity";

export function screen(
  pools: Pool[],
  {
    window = "1h",
    sort = "gainers",
    minLiquidityUsd = 5_000,
    limit = 25,
    query = "",
    quote = "",
  }: {
    window?: Window;
    sort?: ScreenSort;
    minLiquidityUsd?: number;
    limit?: number;
    /** Free text: a ticker, part of a name, or a contract address. */
    query?: string;
    /** Quote asset symbol, so a board can be narrowed to one pairing. */
    quote?: string;
  } = {},
): Pool[] {
  const q = query.trim().toLowerCase();
  const wantedQuote = quote.trim().toUpperCase();

  let population = pools;

  if (wantedQuote) {
    population = population.filter(
      (p) => p.quoteSymbol.toUpperCase() === wantedQuote,
    );
  }

  if (q) {
    /**
     * An address is matched by prefix rather than in full.
     *
     * People paste a truncated address as often as a complete one, because
     * that is the form the interface showed them. Requiring all forty
     * characters would fail the commonest way anybody actually searches.
     */
    population = population.filter(
      (p) =>
        p.symbol.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.address.toLowerCase().startsWith(q) ||
        (p.baseTokenAddress ?? "").toLowerCase().startsWith(q),
    );
  }

  /**
   * A search ignores the liquidity floor.
   *
   * The floor exists to keep a browsing board free of dust. Somebody typing a
   * ticker has already named what they want, and answering "no results"
   * because it holds four hundred dollars of liquidity is the screener
   * refusing to show them the thing they asked for by name.
   */
  const floor = q ? 0 : minLiquidityUsd;
  const liquid = population.filter((p) => (p.liquidityUsd ?? 0) >= floor);

  switch (sort) {
    case "gainers":
      return liquid
        .filter((p) => (p.change[window] ?? 0) > 0)
        .sort((a, b) => (b.change[window] ?? 0) - (a.change[window] ?? 0))
        .slice(0, limit);

    case "losers":
      return liquid
        .filter((p) => (p.change[window] ?? 0) < 0)
        .sort((a, b) => (a.change[window] ?? 0) - (b.change[window] ?? 0))
        .slice(0, limit);

    case "volume":
      return liquid
        .filter((p) => p.volume[window] !== null)
        .sort((a, b) => (b.volume[window] ?? 0) - (a.volume[window] ?? 0))
        .slice(0, limit);

    case "liquidity":
      return liquid
        .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))
        .slice(0, limit);

    /**
     * Handled by the page, which swaps the whole board for one of tokens
     * launched here. Listed so the switch stays exhaustive; a screener of
     * chain pools has nothing to say about a token with no pool.
     */
    case "curve":
      return [];

    case "trending":
      /**
       * Left in the order it arrived.
       *
       * Trending is already a ranking, computed upstream from activity we do
       * not hold. Re-sorting it by anything of ours would throw that away and
       * produce a board that is not the thing its label promises.
       */
      return liquid.slice(0, limit);

    case "new":
      return liquid
        .filter((p) => p.createdAt)
        .sort(
          (a, b) =>
            new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime(),
        )
        .slice(0, limit);
  }
}

/** The narrow case, kept because two callers only ever want movers. */
export function rankMovers(
  pools: Pool[],
  direction: "up" | "down",
  minLiquidityUsd = 5_000,
  limit = 6,
): Pool[] {
  return screen(pools, {
    window: "1h",
    sort: direction === "up" ? "gainers" : "losers",
    minLiquidityUsd,
    limit,
  });
}

/**
 * Token logos, by contract address.
 *
 * The multi-token endpoint takes up to thirty addresses at once, which is what
 * makes this affordable: a portfolio is a handful of tokens, so it is one
 * request rather than one per row.
 *
 * Cached for an hour. A token's artwork does not change, and the endpoint is
 * rate limited on the free tier that the rest of this file also depends on.
 */
export async function getTokenImages(
  addresses: string[],
): Promise<Map<string, string>> {
  const images = new Map<string, string>();
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
  if (unique.length === 0) return images;

  // Thirty per request is the documented ceiling.
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 30) {
    chunks.push(unique.slice(i, i + 30));
  }

  const responses = await Promise.all(
    chunks.map((chunk) =>
      get<{
        data?: {
          attributes?: { address?: string; image_url?: string | null };
        }[];
      }>(`/networks/${NETWORK}/tokens/multi/${chunk.join(",")}`, 3600),
    ),
  );

  for (const json of responses) {
    for (const token of json?.data ?? []) {
      const address = token.attributes?.address?.toLowerCase();
      const url = token.attributes?.image_url;
      // GeckoTerminal returns the string "missing.png" rather than null for a
      // token it has no artwork for, which would render as a broken image.
      if (address && url && !url.includes("missing")) {
        images.set(address, url);
      }
    }
  }

  return images;
}

/**
 * A pool, looked up in the feeds we already hold.
 *
 * The single-pool endpoint is the direct way to answer this and it is not a
 * reliable one: GeckoTerminal rate limits the free tier, `get` turns any
 * non-ok response into null, and the token page turned null into a 404. The
 * result was pools that opened fine one moment and 404ed the next, which reads
 * as broken links rather than as throttling.
 *
 * The feeds behind this are the same cached responses the boards render from,
 * so on the common path this costs nothing and cannot be throttled: if a pool
 * was listed on a board, it is already in memory here.
 */
export async function findPoolInFeeds(address: string): Promise<Pool | null> {
  const wanted = address.toLowerCase();

  const feeds = await Promise.all([
    getNewPools().catch(() => []),
    getTopPools().catch(() => []),
    getTrendingPools().catch(() => []),
  ]);

  for (const pools of feeds) {
    const hit = pools.find((p) => p.address.toLowerCase() === wanted);
    if (hit) return hit;
  }
  return null;
}


/**
 * Every quote asset present in a set of pools, commonest first.
 *
 * Derived from the data rather than hardcoded, because the chain runs several
 * exchanges and the assets people pair against change without asking us. A
 * hardcoded list would quietly stop matching reality.
 */
export function quoteAssets(pools: Pool[]): { symbol: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of pools) {
    const symbol = p.quoteSymbol.toUpperCase();
    if (!symbol) continue;
    counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([symbol, count]) => ({ symbol, count }))
    .sort((a, b) => b.count - a.count);
}
