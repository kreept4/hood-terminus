"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card } from "@/components/primitives/Card";
import { clsx } from "@/lib/clsx";
import { truncateAddress } from "@/lib/format";
import type { WalletPnl } from "@/lib/wallets/rankings";
import { TrackButton } from "@/components/wallets/WalletTracker";

/**
 * The copy-trading board.
 *
 * Bots are not on it at all. Arbitrage, market making and sniping wallets are
 * filtered out upstream rather than labelled here, because the board answers
 * one question and the answer for every one of them is no: their edge is
 * latency, and a copier is late by definition. Labelled, they simply occupied
 * the top of a leaderboard nobody should act on.
 *
 * Sorted by realised profit by default, not win rate. That is the other design
 * decision here: win rate on its own ranks a wallet that scalped thirty
 * guaranteed spreads above one that took four losses and a hundredfold winner,
 * and the second is the one worth following. The data bears it out — the most
 * profitable wallet in this window closed a third of its positions in profit.
 *
 * Every number is a fact about a window, and the window is stated under the
 * board rather than left for someone to assume.
 */

type Sort = "realised" | "winRate" | "activity";

const SORTS: { value: Sort; label: string }[] = [
  { value: "realised", label: "Profit" },
  { value: "winRate", label: "Win rate" },
  { value: "activity", label: "Activity" },
];

export function PnlBoard({ wallets }: { wallets: WalletPnl[] }) {
  const [sort, setSort] = useState<Sort>("realised");
  const [minWinRate, setMinWinRate] = useState(0);

  const rows = useMemo(() => {
    const filtered = wallets.filter((w) => w.winRatePct >= minWinRate);

    return [...filtered].sort((a, b) => {
      if (sort === "winRate") return b.winRatePct - a.winRatePct;
      if (sort === "activity") return b.tradeCount - a.tradeCount;
      return b.realisedEth - a.realisedEth;
    });
  }, [wallets, sort, minWinRate]);

  const window = wallets[0];

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        {/* ── Controls ────────────────────────────────────────────────── */}
        <div className="scroll-x flex items-center gap-3 border-b border-line-soft px-3 py-2.5">
          <div className="flex shrink-0 items-center rounded-md border border-line-soft bg-surface-2 p-0.5">
            {SORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSort(s.value)}
                aria-pressed={sort === s.value}
                className={clsx(
                  "rounded-sm px-2.5 py-1.5 text-micro whitespace-nowrap transition-colors duration-100",
                  sort === s.value
                    ? "bg-surface text-ink"
                    : "text-ink-3 hover:text-ink",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          <span className="h-5 w-px shrink-0 bg-line-soft" aria-hidden="true" />

          <div className="flex shrink-0 items-center rounded-md border border-line-soft bg-surface-2 p-0.5">
            {[0, 50, 60, 70].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setMinWinRate(v)}
                aria-pressed={minWinRate === v}
                className={clsx(
                  "tnum rounded-sm px-2.5 py-1.5 text-micro whitespace-nowrap transition-colors duration-100",
                  minWinRate === v
                    ? "bg-surface text-ink"
                    : "text-ink-3 hover:text-ink",
                )}
              >
                {v === 0 ? "Any win rate" : `${v}%+`}
              </button>
            ))}
          </div>

        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-body text-ink-3">
            No wallet matches those filters yet.
          </p>
        ) : (
          <>
            {/* ── Phone ───────────────────────────────────────────────── */}
            <ul className="flex flex-col sm:hidden">
              {rows.map((w) => (
                <li key={w.walletAddress}>
                  <Link
                    href={`/w/${w.walletAddress}`}
                    className="flex flex-col gap-1.5 border-b border-line-soft px-4 py-3 last:border-b-0 active:bg-surface-2"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="tnum truncate text-body font-medium text-ink">
                        {truncateAddress(w.walletAddress, 6)}
                      </span>
                      <Profit eth={w.realisedEth} />
                    </span>
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-micro text-ink-3">
                        {w.wins}W / {w.losses}L across {w.poolCount} tokens
                      </span>
                      <span className="tnum text-micro text-ink-2">
                        {w.winRatePct.toFixed(0)}%
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            {/* ── Tablet and up ───────────────────────────────────────── */}
            <div className="hidden w-full overflow-x-auto sm:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-line-soft text-ink-3">
                    <th className="py-2 pl-4 text-micro font-normal">Wallet</th>
                    <th className="px-3 py-2 text-right text-micro font-normal">
                      Profit
                    </th>
                    <th className="px-3 py-2 text-right text-micro font-normal">
                      Win rate
                    </th>
                    <th className="px-3 py-2 text-right text-micro font-normal">
                      W / L
                    </th>
                    <th className="hidden px-3 py-2 text-right text-micro font-normal md:table-cell">
                      Best
                    </th>
                    <th className="hidden px-3 py-2 text-right text-micro font-normal md:table-cell">
                      Tokens
                    </th>
                    <th className="py-2 pr-4 text-right text-micro font-normal">
                      Track
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((w) => (
                    <tr
                      key={w.walletAddress}
                      className="group relative border-b border-line-soft transition-colors duration-100 last:border-b-0 hover:bg-surface-2"
                    >
                      <td className="py-2.5 pl-4">
                        {/* Stretched over the whole row. The row already
                            highlights on hover, so anything less made most of
                            it look clickable and do nothing. The Track button
                            is lifted above the overlay rather than nested in
                            the link, which would be invalid and eat its click. */}
                        <Link
                          href={`/w/${w.walletAddress}`}
                          className="tnum text-body text-ink transition-colors duration-100 group-hover:text-green after:absolute after:inset-0 after:content-['']"
                        >
                          {truncateAddress(w.walletAddress, 6)}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Profit eth={w.realisedEth} />
                      </td>
                      <td className="tnum px-3 py-2.5 text-right text-body text-ink">
                        {w.winRatePct.toFixed(0)}%
                      </td>
                      <td className="tnum px-3 py-2.5 text-right text-body text-ink-2">
                        {w.wins} / {w.losses}
                      </td>
                      <td className="tnum hidden px-3 py-2.5 text-right text-body text-green md:table-cell">
                        {w.bestPct === null ? "-" : `+${w.bestPct.toFixed(0)}%`}
                      </td>
                      <td className="tnum hidden px-3 py-2.5 text-right text-body text-ink-2 md:table-cell">
                        {w.poolCount}
                      </td>
                      <td className="relative z-10 py-2.5 pr-4 text-right">
                        <TrackButton address={w.walletAddress} compact />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* The window, and what the numbers do and do not include. Stated once,
          under the board, rather than repeated on every row. */}
      <p className="max-w-2xl text-micro text-ink-3">
        Closed positions only, matched first in first out, over the last seven
        days of indexed trades. Profit is in ETH and covers markets quoted
        against ETH. A wallet needs three closed positions to appear, and
        wallets that trade like bots are excluded.
        {window?.windowEnd && (
          <> Last computed {new Date(window.windowEnd).toLocaleString()}.</>
        )}
      </p>
    </div>
  );
}

/** Exported so a wallet's own page states profit the same way the board does. */
export function Profit({ eth }: { eth: number }) {
  const positive = eth > 0;
  return (
    <span
      className={clsx(
        "tnum text-body font-medium",
        positive ? "text-green" : eth < 0 ? "text-red" : "text-ink-2",
      )}
    >
      {positive ? "+" : ""}
      {eth.toFixed(4)} ETH
    </span>
  );
}
