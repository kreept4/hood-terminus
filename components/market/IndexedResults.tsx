import Link from "next/link";
import type { IndexedPool } from "@/lib/market/pool-index";
import { truncateAddress } from "@/lib/format";

/**
 * Search results the market data feed did not have.
 *
 * These come from our own index of the factory, which knows every pool on the
 * chain rather than the busiest hundred. That is the whole reason they exist:
 * without this, searching for a real token that happens to be quiet answered
 * "nothing found", which reads as the token not existing rather than as us not
 * having looked.
 *
 * Deliberately plainer than the table above. There is no price, volume or
 * liquidity here because the index holds none, and inventing a dash in every
 * column would dress a directory up as a market feed. A pair, a fee tier and a
 * way through to the token is what we have, so it is what is shown.
 */
export function IndexedResults({ pools }: { pools: IndexedPool[] }) {
  if (pools.length === 0) return null;

  return (
    <div className="mt-6">
      <p className="mb-3 text-body text-ink-2">
        {pools.length} more {pools.length === 1 ? "pair" : "pairs"} on chain,
        newest first, not currently carrying market data
      </p>

      <div className="flex flex-col gap-1.5">
        {pools.map((p) => (
          <Link
            key={p.address}
            href={`/t/${p.address}`}
            className="flex items-center justify-between gap-3 rounded-md border border-line-soft px-3 py-2.5 transition-colors duration-100 hover:border-green-line hover:bg-surface-2"
          >
            <span className="min-w-0 truncate text-body text-ink">
              {p.token0Symbol ?? "?"}
              <span className="text-ink-3"> / </span>
              {p.token1Symbol ?? "?"}
            </span>
            <span className="flex shrink-0 items-center gap-3">
              <span className="tnum text-micro text-ink-3">
                {p.fee / 10_000}%
              </span>
              <span className="tnum text-micro text-ink-3">
                {truncateAddress(p.address)}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
