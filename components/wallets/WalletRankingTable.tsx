import Link from "next/link";
import { formatAge, formatCount, truncateAddress, NO_VALUE } from "@/lib/format";
import type { WalletRanking } from "@/lib/wallets/rankings";

/** The ranked list. Only rendered when the ranking job has produced one. */
export function WalletRankingTable({ wallets }: { wallets: WalletRanking[] }) {
  return (
    <>
      {/* ── Phone ───────────────────────────────────────────────────── */}
      <ul className="flex flex-col sm:hidden">
        {wallets.map((w) => (
          <li key={w.walletAddress}>
            <Link
              href={`/w/${w.walletAddress}`}
              className="flex flex-col gap-1 border-b border-line-soft px-4 py-3 last:border-b-0 active:bg-surface-2"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="tnum truncate text-body font-medium text-ink">
                    {truncateAddress(w.walletAddress)}
                  </span>
                </span>
                <span className="tnum shrink-0 text-body text-ink">
                  {formatCount(w.tradeCount)}
                </span>
              </span>
              <span className="text-micro text-ink-3">
                {formatCount(w.poolCount)} tokens
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* ── Tablet and up ───────────────────────────────────────────── */}
      <div className="hidden w-full overflow-x-auto sm:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line-soft text-ink-3">
              <th className="px-3 py-2 text-micro font-normal">Wallet</th>
              <th className="px-3 py-2 text-right text-micro font-normal">
                Trades
              </th>
              <th className="px-3 py-2 text-right text-micro font-normal">
                Tokens
              </th>
              <th className="hidden py-2 pr-4 text-right text-micro font-normal md:table-cell">
                Updated
              </th>
            </tr>
          </thead>
          <tbody>
            {wallets.map((w) => (
              <tr
                key={w.walletAddress}
                className="group relative border-b border-line-soft transition-colors duration-100 last:border-b-0 hover:bg-surface-2"
              >
                <td className="py-2 pl-4">
                  {/* Stretched over the whole row, matching the profit board.
                      The row highlights on hover, so the click target has to be
                      the row and not just the address. */}
                  <Link
                    href={`/w/${w.walletAddress}`}
                    className="tnum text-body text-ink transition-colors duration-100 group-hover:text-green after:absolute after:inset-0 after:content-['']"
                  >
                    {truncateAddress(w.walletAddress, 6)}
                  </Link>
                </td>
                <td className="tnum px-3 py-2 text-right text-body text-ink">
                  {formatCount(w.tradeCount)}
                </td>
                <td className="tnum px-3 py-2 text-right text-body text-ink-2">
                  {formatCount(w.poolCount)}
                </td>
                <td
                  className="tnum hidden py-2 pr-4 text-right text-body text-ink-3 md:table-cell"
                  suppressHydrationWarning
                >
                  {w.updatedAt ? formatAge(w.updatedAt) : NO_VALUE}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
