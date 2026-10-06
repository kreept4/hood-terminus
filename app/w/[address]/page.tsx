import Link from "next/link";
import { Card } from "@/components/primitives/Card";
import { Stat, StatRow } from "@/components/primitives/Stat";
import { AwaitingData } from "@/components/primitives/States";
import { CopyAddress } from "@/components/wallet/CopyAddress";
import { HoldingsPanel } from "@/components/wallets/HoldingsPanel";
import { TrackButton } from "@/components/wallets/WalletTracker";
import { robinhoodChain } from "@/lib/chain";
import { getWalletRanking, getWalletRecentSwaps } from "@/lib/wallets/rankings";
import { IconExternal } from "@/components/shell/NavIcons";
import { formatAge, formatCount, truncateAddress, NO_VALUE } from "@/lib/format";

export const revalidate = 30;

type Params = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Params) {
  const { address } = await params;
  return { title: truncateAddress(address, 6) };
}

export default async function WalletPage({ params }: Params) {
  const { address } = await params;
  const [ranking, swaps] = await Promise.all([
    getWalletRanking(address),
    getWalletRecentSwaps(address, 40),
  ]);

  const explorer = robinhoodChain.blockExplorers.default.url;
  const pools = new Set(swaps.map((s) => s.poolAddress)).size;

  return (
    <div className="gutter py-8 md:py-10">
      <Link
        href="/wallets"
        className="text-micro text-ink-3 transition-colors duration-100 hover:text-ink"
      >
        Back to wallets
      </Link>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="tnum text-h2 leading-none font-semibold text-ink">
            {truncateAddress(address, 6)}
          </h1>
          <div className="mt-3 flex items-center gap-2">
            <CopyAddress address={address} chars={8} />
            <a
              href={`${explorer}/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View on the block explorer"
              title="View on the block explorer"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-line text-ink-2 transition-colors duration-100 hover:border-green hover:text-green"
            >
              <IconExternal />
            </a>
          </div>
        </div>

        <TrackButton address={address} />
      </header>

      {/* Holdings first. It is read live from the chain, so it is the part of
          this page that works today, and it is what someone deciding whether
          to follow a wallet actually looks at. */}
      <div className="mt-6">
        <HoldingsPanel address={address} />
      </div>

      {/* ── What a follower needs to decide ────────────────────────── */}
      <Card className="mt-6 px-5 py-5">
        <StatRow>
          <Stat
            label="Trades, 7d"
            value={ranking ? formatCount(ranking.tradeCount) : NO_VALUE}
          />
          <Stat
            label="Tokens traded"
            value={ranking ? formatCount(ranking.poolCount) : formatCount(pools)}
          />
          <Stat
            label="Last active"
            value={
              swaps[0] ? `${formatAge(swaps[0].createdAt)} ago` : NO_VALUE
            }
          />
          <Stat
            label="Last block"
            value={ranking?.lastActiveBlock?.toLocaleString() ?? NO_VALUE}
          />
          <Stat label="Realised profit" value={NO_VALUE} hint="Not computed" />
          <Stat label="Win rate" value={NO_VALUE} hint="Not computed" />
        </StatRow>
      </Card>

      {/* The two figures anyone actually wants are the two we cannot compute
          yet. Leaving them blank with a short reason is the only honest option:
          inventing a win rate out of trade counts would be a number a reader
          acts on with money. */}
      <p className="mt-3 text-micro text-ink-3">
        Profit and win rate are not live yet. This page shows activity.
      </p>

      <div className="mt-8">
        <Card className="overflow-hidden">
          <header className="border-b border-line-soft px-4 py-3">
            <h2 className="text-body font-semibold text-ink">Recent trades</h2>
          </header>

          {swaps.length === 0 ? (
            <AwaitingData what="No trades recorded for this wallet" />
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-line-soft text-ink-3">
                    <th className="px-4 py-2 text-micro font-normal">Token</th>
                    <th className="px-4 py-2 text-micro font-normal">Block</th>
                    <th className="px-4 py-2 text-right text-micro font-normal">
                      Age
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {swaps.map((s) => (
                    <tr
                      key={s.txHash}
                      className="border-b border-line-soft last:border-b-0 hover:bg-surface-2"
                    >
                      <td className="px-4 py-2">
                        <Link
                          href={`/t/${s.poolAddress}`}
                          className="tnum text-body text-ink transition-colors duration-100 hover:text-green"
                        >
                          {truncateAddress(s.poolAddress)}
                        </Link>
                      </td>
                      <td className="tnum px-4 py-2 text-body text-ink-2">
                        {s.blockNumber.toLocaleString()}
                      </td>
                      <td className="tnum px-4 py-2 text-right text-body text-ink-3">
                        {formatAge(s.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
