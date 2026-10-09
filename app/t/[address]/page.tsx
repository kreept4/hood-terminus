import Link from "next/link";
import { notFound } from "next/navigation";
import { CurveTokenPage } from "@/components/create/CurveTokenPage";
import { getCurveToken } from "@/lib/launchpad/curve";
import { Board } from "@/components/market/Board";
import { PoolTable } from "@/components/market/PoolTable";
import { PriceChart } from "@/components/market/PriceChart";
import { Card } from "@/components/primitives/Card";
import { Delta } from "@/components/primitives/Delta";
import { Stat, StatRow } from "@/components/primitives/Stat";
import { CopyAddress } from "@/components/wallet/CopyAddress";
import { VerifyPanel } from "@/components/verify/VerifyPanel";
import { IconExternal } from "@/components/shell/NavIcons";
import { TokenLogo } from "@/components/market/TokenLogo";
import { robinhoodChain } from "@/lib/chain";
import {
  getCandles,
  getPool,
  getPoolWithLogo,
  findPoolInFeeds,
  getPoolsForToken,
} from "@/lib/market/gecko";
import {
  formatAge,
  formatCount,
  formatPrice,
  formatUsd,
  NO_VALUE,
} from "@/lib/format";

export const revalidate = 15;

type Params = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Params) {
  const { address } = await params;
  const pool = await getPool(address);

  if (pool) {
    return {
      title: `${pool.symbol} ${formatPrice(pool.priceUsd)}`,
      description: `${pool.name} on Robinhood Chain. Price, liquidity, volume and trades.`,
    };
  }

  /**
   * A curve token's link is the launch.
   *
   * Nothing outside this site can see a token before it graduates, so the only
   * way anyone finds one is the creator posting the link. That makes this
   * preview card the entire top of the funnel, and it previewed as the word
   * "Token" with no image and no description, which is a link nobody clicks.
   *
   * The percentage is in the description on purpose: it is the one number that
   * makes a stranger act, because it says both that others have already bought
   * and how much is left before the market opens.
   */
  const curve = await getCurveToken(address);
  if (curve) {
    const percent = Math.round(curve.progress * 100);
    const title = `${curve.name} (${curve.symbol})`;
    const description =
      curve.description ??
      `${percent}% of the way to opening a market. ${curve.raisedEth.toFixed(3)} of 4 ETH raised on Hood Terminus.`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        images: curve.imageUrl ? [{ url: curve.imageUrl }] : undefined,
      },
      twitter: {
        card: curve.imageUrl ? "summary_large_image" : "summary",
        title,
        description,
        images: curve.imageUrl ? [curve.imageUrl] : undefined,
      },
    };
  }

  return { title: "Token" };
}

export default async function TokenPage({ params }: Params) {
  const { address } = await params;

  /**
   * The candles are asked for before the pool is looked up, not after it.
   *
   * Every link into this page is built from a pool address, so this request
   * does not need the lookup's answer, and waiting for it turned one round
   * trip into two against a rate limited API. The catch is what makes starting
   * early safe: if this is not a pool address the answer is thrown away rather
   * than becoming an unhandled rejection.
   */
  const candlesEarly = getCandles(address, "1h").catch(() => null);

  let found = await getPoolWithLogo(address);

  /**
   * Before giving up, look in the feeds already in memory.
   *
   * A miss above is as likely to be a rate limited request as a nonexistent
   * pool, and the boards link straight here, so throttling showed up as dead
   * links on pools that were visibly listed a second earlier.
   */
  if (!found) {
    const cached = await findPoolInFeeds(address);
    if (cached) found = { pool: cached, logo: cached.imageUrl };
  }

  /**
   * Still nothing means this might be a token still on its curve.
   *
   * Every card on the curve board links here, and until this fallback existed
   * every one of them 404ed: the lookup above asks GeckoTerminal for a pool,
   * and a token that has not graduated does not have one. Falling through to
   * the launchpad is what makes a curve token a page rather than a dead link.
   */
  if (!found) {
    const curve = await getCurveToken(address);
    if (curve) return <CurveTokenPage token={curve} />;
    notFound();
  }
  const { pool, logo } = found;

  // The early request is only reusable if it asked about this same pool, which
  // it did unless the lookup resolved to a different one.
  const samePool = pool.address.toLowerCase() === address.toLowerCase();

  const [candlesMaybe, markets] = await Promise.all([
    samePool ? candlesEarly : getCandles(pool.address, "1h"),
    pool.baseTokenAddress
      ? getPoolsForToken(pool.baseTokenAddress)
      : Promise.resolve([]),
  ]);
  const candles = candlesMaybe ?? (await getCandles(pool.address, "1h"));

  const others = markets.filter(
    (m) => m.address.toLowerCase() !== pool.address.toLowerCase(),
  );

  const buys = pool.buys24h ?? 0;
  const sells = pool.sells24h ?? 0;
  const trades = buys + sells;
  // Buy pressure only means something once there are enough trades for a ratio
  // to be a ratio rather than a coincidence.
  const buyShare = trades >= 10 ? (buys / trades) * 100 : null;
  const explorer = robinhoodChain.blockExplorers.default.url;

  return (
    <div className="gutter py-8 md:py-10">
      <Link
        href="/"
        className="text-micro text-ink-3 transition-colors duration-100 hover:text-ink"
      >
        Back to markets
      </Link>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="mt-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <TokenLogo
              symbol={pool.symbol}
              address={pool.baseTokenAddress ?? pool.address}
              src={logo}
              size={44}
            />
            <span className="text-h1 leading-none font-bold tracking-tight text-ink">
              {pool.symbol}
            </span>
            <span className="text-lead text-ink-3">{pool.quoteSymbol}</span>
          </h1>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <span className="tnum text-h2 leading-none font-semibold text-ink">
              {formatPrice(pool.priceUsd)}
            </span>
            <Delta value={pool.change24h} size="lg" arrow digits={2} />
            <span className="text-micro text-ink-3">24h</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/trade"
            className="rounded-md bg-green px-4 py-2.5 text-body font-semibold text-on-accent transition-opacity duration-100 hover:opacity-90"
          >
            Trade {pool.symbol}
          </Link>
          <a
            href={`${explorer}/address/${pool.baseTokenAddress ?? pool.address}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View on the block explorer"
            title="View on the block explorer"
            className="flex h-[42px] w-[42px] items-center justify-center rounded-md border border-line text-ink transition-colors duration-100 hover:border-green hover:text-green"
          >
            <IconExternal />
          </a>
        </div>
      </header>

      {/* ── Chart ──────────────────────────────────────────────────── */}
      <Card className="mt-6 overflow-hidden">
        <PriceChart
          poolAddress={pool.address}
          initialCandles={candles}
          initialTimeframe="1h"
        />
      </Card>

      {/* ── Verify ─────────────────────────────────────────────────── */}
      {/* Directly under the chart, above the figures.

          The question this answers, can I sell this, is asked before any of the
          numbers below matter: a market cap on a token nobody can exit is not a
          figure, it is bait. It needs the base token rather than the pool,
          because the contract with the powers is the token's. */}
      {pool.baseTokenAddress && (
        <VerifyPanel token={pool.baseTokenAddress} className="mt-4" />
      )}

      {/* ── Figures ────────────────────────────────────────────────── */}
      <Card className="mt-4 px-5 py-5">
        <StatRow>
          <Stat label="Liquidity" value={formatUsd(pool.liquidityUsd)} />
          <Stat label="Volume, 24h" value={formatUsd(pool.volume24hUsd)} />
          <Stat label="Market cap" value={formatUsd(pool.marketCapUsd)} />
          <Stat label="Trades, 24h" value={formatCount(trades)} />
          <Stat
            label="Buys and sells"
            value={
              <span>
                <span className="text-green">{formatCount(buys)}</span>
                <span className="mx-1 text-ink-3">/</span>
                <span className="text-red">{formatCount(sells)}</span>
              </span>
            }
          />
          <Stat
            label="Market age"
            value={pool.createdAt ? formatAge(pool.createdAt) : NO_VALUE}
          />
        </StatRow>

        <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-line-soft pt-5 sm:grid-cols-4">
          <Stat label="5m" value={<Delta value={pool.change5m} digits={2} />} />
          <Stat label="1h" value={<Delta value={pool.change1h} digits={2} />} />
          <Stat
            label="6h"
            value={<Delta value={pool.change["6h"]} digits={2} />}
          />
          <Stat label="24h" value={<Delta value={pool.change24h} digits={2} />} />
        </div>

        {buyShare !== null && (
          <div className="mt-5 border-t border-line-soft pt-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-body text-ink-2">Buy pressure, 24h</span>
              <span className="tnum text-body text-ink">
                {buyShare.toFixed(0)}% buys
              </span>
            </div>
            <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-red">
              <div
                className="bg-green"
                style={{ width: `${buyShare}%` }}
                aria-hidden="true"
              />
            </div>
          </div>
        )}
      </Card>

      {/* ── Identity ───────────────────────────────────────────────── */}
      <Card className="mt-4 px-5 py-4">
        <dl className="flex flex-col gap-3">
          <IdRow label="Token address" value={pool.baseTokenAddress} />
          <IdRow label="Market address" value={pool.address} />
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-body text-ink-3">Pair</dt>
            <dd className="truncate text-body text-ink-2">{pool.name}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-body text-ink-3">Chain</dt>
            <dd className="text-body text-ink-2">
              Robinhood Chain, {robinhoodChain.id}
            </dd>
          </div>
        </dl>
      </Card>

      {others.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-h3 font-semibold text-ink">Other markets</h2>
          <Board>
            <PoolTable
              pools={others}
              sort="volume"
              window="24h"
              emptyLabel="No other markets"
            />
          </Board>
        </div>
      )}
    </div>
  );
}

function IdRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-body text-ink-3">{label}</dt>
      <dd className="flex items-center gap-2">
        {value ? (
          <CopyAddress address={value} />
        ) : (
          <span className="text-body text-ink-3">{NO_VALUE}</span>
        )}
      </dd>
    </div>
  );
}
