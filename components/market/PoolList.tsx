import Link from "next/link";
import type { Pool } from "@/lib/market/gecko";
import { Delta } from "@/components/primitives/Delta";
import { formatAge, formatPrice, formatUsd } from "@/lib/format";
import { clsx } from "@/lib/clsx";
import { TokenLogo } from "@/components/market/TokenLogo";

/**
 * The dense list every market surface uses: gainers, losers, trending, new.
 *
 * Columns are chosen per surface rather than shown all at once. A trader
 * scanning new launches wants age and liquidity; one scanning gainers wants the
 * move. Showing both everywhere is how a table becomes unreadable.
 *
 * Rows are 44px on a phone even though the text needs less, because a row is a
 * link and a link a thumb has to hit twice is a broken link.
 */
export function PoolList({
  pools,
  show = "change",
  rank = false,
  emptyLabel = "Nothing here",
}: {
  pools: Pool[];
  show?: "change" | "age" | "volume";
  /** Numbers the rows. Only for boards that are genuinely an ordering. */
  rank?: boolean;
  emptyLabel?: string;
}) {
  if (pools.length === 0) {
    return <p className="px-4 py-10 text-body text-ink-3">{emptyLabel}</p>;
  }

  return (
    <ul className="flex flex-col">
      {pools.map((p, i) => (
        <li key={p.address}>
          <PoolRow pool={p} show={show} index={rank ? i + 1 : undefined} />
        </li>
      ))}
    </ul>
  );
}

function PoolRow({
  pool,
  show,
  index,
}: {
  pool: Pool;
  show: "change" | "age" | "volume";
  index?: number;
}) {
  return (
    <Link
      href={`/t/${pool.address}`}
      className={clsx(
        "flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-b-0",
        "transition-colors duration-100 hover:bg-surface-2",
      )}
    >
      {index !== undefined && (
        <span className="tnum w-4 shrink-0 text-micro text-ink-3">{index}</span>
      )}

      <TokenLogo
        symbol={pool.symbol}
        address={pool.baseTokenAddress ?? pool.address}
        src={pool.imageUrl}
        size={26}
      />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-ink">
          {pool.symbol}
        </span>
        <span className="block truncate text-micro text-ink-3">
          {show === "age" && pool.createdAt
            ? `${formatAge(pool.createdAt)} old, ${formatUsd(pool.liquidityUsd)} liquidity`
            : `${pool.quoteSymbol}, ${formatUsd(pool.liquidityUsd)} liquidity`}
        </span>
      </span>

      <span className="tnum shrink-0 text-right text-body text-ink">
        {formatPrice(pool.priceUsd)}
      </span>

      <span className="shrink-0 text-right" style={{ minWidth: "6ch" }}>
        {show === "volume" ? (
          <span className="tnum text-body text-ink-2">
            {formatUsd(pool.volume24hUsd)}
          </span>
        ) : (
          <Delta value={pool.change1h} digits={1} />
        )}
      </span>
    </Link>
  );
}
