import Link from "next/link";
import type { Pool, Window } from "@/lib/market/gecko";
import { Delta } from "@/components/primitives/Delta";
import { formatAge, formatPrice, formatUsd, NO_VALUE } from "@/lib/format";
import { clsx } from "@/lib/clsx";
import { TokenLogo } from "@/components/market/TokenLogo";

/**
 * The board every market surface renders.
 *
 * Two layouts from one component, because a phone and a desktop want different
 * things rather than the same thing smaller. Below `sm` each pool is a stacked
 * row: symbol and price on the first line, the numbers that qualify them on the
 * second. From `sm` up it is a real table, so a column of prices aligns down
 * the whole board, which flex rows cannot do.
 *
 * Squeezing nine columns onto a 390px screen was the alternative, and it is why
 * the mobile board was unreadable: every cell truncated to nothing.
 */

type Props = {
  pools: Pool[];
  /** The column the board is ordered by. Gets the accent treatment. */
  sort?: "change" | "volume" | "age";
  /** Which window the change and volume columns report. */
  window?: Window;
  emptyLabel?: string;
};

export function PoolTable({
  pools,
  sort = "change",
  window = "1h",
  emptyLabel = "Nothing here",
}: Props) {
  if (pools.length === 0) {
    return <p className="px-4 py-10 text-body text-ink-3">{emptyLabel}</p>;
  }

  // The selected window leads; 24h stays alongside it as the reference every
  // trader already has a feel for. Showing the same window twice would waste a
  // column, so it is dropped when the two coincide.
  const showReference = window !== "24h";

  return (
    <>
      {/* ── Phone ───────────────────────────────────────────────────── */}
      <ul className="flex flex-col sm:hidden">
        {pools.map((p, i) => (
          <li key={p.address}>
            <StackedRow pool={p} index={i + 1} window={window} sort={sort} />
          </li>
        ))}
      </ul>

      {/* ── Tablet and up ───────────────────────────────────────────── */}
      <div className="hidden w-full overflow-x-auto sm:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line-soft">
              <Th className="w-10 pl-4 text-right">#</Th>
              <Th>Token</Th>
              <Th className="text-right">Price</Th>
              <Th className="text-right" active={sort === "change"}>
                {window}
              </Th>
              {showReference && <Th className="text-right">24h</Th>}
              <Th
                className="hidden text-right md:table-cell"
                active={sort === "volume"}
              >
                Vol {window}
              </Th>
              <Th className="hidden text-right md:table-cell">Liquidity</Th>
              <Th className="hidden text-right lg:table-cell">Mkt cap</Th>
              <Th
                className="hidden pr-4 text-right lg:table-cell"
                active={sort === "age"}
              >
                Age
              </Th>
            </tr>
          </thead>

          <tbody>
            {pools.map((p, i) => (
              <Row
                key={p.address}
                pool={p}
                index={i + 1}
                window={window}
                showReference={showReference}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * The phone row.
 *
 * Two lines, both of them full width, so nothing has to truncate to a stub.
 * The second line carries whichever three figures qualify the first: what it
 * trades against, how deep the pool is, and either its age or its volume
 * depending on what the board is sorted by.
 */
function StackedRow({
  pool,
  index,
  window,
  sort,
}: {
  pool: Pool;
  index: number;
  window: Window;
  sort: "change" | "volume" | "age";
}) {
  return (
    <Link
      href={`/t/${pool.address}`}
      className="flex flex-col gap-1 border-b border-line-soft px-4 py-3 last:border-b-0 active:bg-surface-2"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="tnum shrink-0 text-micro text-ink-3">{index}</span>
          <TokenLogo
            symbol={pool.symbol}
            address={pool.baseTokenAddress ?? pool.address}
            src={pool.imageUrl}
            size={22}
          />
          <span className="truncate text-body font-medium text-ink">
            {pool.symbol}
          </span>
          <span className="shrink-0 text-micro text-ink-3">
            {pool.quoteSymbol}
          </span>
        </span>
        <span className="tnum shrink-0 text-body text-ink">
          {formatPrice(pool.priceUsd)}
        </span>
      </span>

      <span className="flex items-baseline justify-between gap-3">
        {/* suppressHydrationWarning: an age is computed from the clock, so a
            row rendered at 3:59 on the server and hydrated at 4:00 legitimately
            differs. Both values are right; only the mismatch warning is
            wrong. */}
        <span
          className="truncate text-micro text-ink-3"
          suppressHydrationWarning
        >
          {formatUsd(pool.liquidityUsd)} liq
          {sort === "age" && pool.createdAt
            ? `, ${formatAge(pool.createdAt)} old`
            : `, ${formatUsd(pool.volume[window])} vol`}
        </span>
        <Delta value={pool.change[window]} digits={1} size="sm" />
      </span>
    </Link>
  );
}

function Th({
  children,
  className,
  active = false,
}: {
  children: React.ReactNode;
  className?: string;
  active?: boolean;
}) {
  return (
    <th
      scope="col"
      className={clsx(
        "px-3 py-2 text-micro font-normal",
        active ? "text-ink-2" : "text-ink-3",
        className,
      )}
    >
      {children}
    </th>
  );
}

/**
 * The row is a link, but a `<tr>` cannot be one. The token cell carries it, so
 * keyboard users get one tab stop per row rather than nine, and the whole row
 * still lights up on hover.
 */
function Row({
  pool,
  index,
  window,
  showReference,
}: {
  pool: Pool;
  index: number;
  window: Window;
  showReference: boolean;
}) {
  const cell = "px-3 py-2 align-middle whitespace-nowrap";

  return (
    <tr className="group border-b border-line-soft transition-colors duration-100 last:border-b-0 hover:bg-surface-2">
      <td className={clsx(cell, "pl-4 text-right")}>
        <span className="tnum text-micro text-ink-3">{index}</span>
      </td>

      <td className={clsx(cell, "max-w-[15rem] min-w-0")}>
        <Link
          href={`/t/${pool.address}`}
          className="flex min-w-0 items-center gap-2.5 text-body font-medium text-ink transition-colors duration-100 group-hover:text-green"
        >
          <TokenLogo
            symbol={pool.symbol}
            address={pool.baseTokenAddress ?? pool.address}
            src={pool.imageUrl}
            size={24}
          />
          <span className="truncate">
            {pool.symbol}
            <span className="ml-1.5 text-micro font-normal text-ink-3">
              {pool.quoteSymbol}
            </span>
          </span>
        </Link>
      </td>

      <td className={clsx(cell, "tnum text-right text-body text-ink")}>
        {formatPrice(pool.priceUsd)}
      </td>

      <td className={clsx(cell, "text-right")}>
        <Delta value={pool.change[window]} digits={1} />
      </td>

      {showReference && (
        <td className={clsx(cell, "text-right")}>
          <Delta value={pool.change24h} digits={1} />
        </td>
      )}

      <td
        className={clsx(
          cell,
          "tnum hidden text-right text-body text-ink-2 md:table-cell",
        )}
      >
        {formatUsd(pool.volume[window])}
      </td>

      <td
        className={clsx(
          cell,
          "tnum hidden text-right text-body text-ink-2 md:table-cell",
        )}
      >
        {formatUsd(pool.liquidityUsd)}
      </td>

      <td
        className={clsx(
          cell,
          "tnum hidden text-right text-body text-ink-2 lg:table-cell",
        )}
      >
        {formatUsd(pool.marketCapUsd)}
      </td>

      <td
        className={clsx(
          cell,
          "tnum hidden pr-4 text-right text-body text-ink-3 lg:table-cell",
        )}
        suppressHydrationWarning
      >
        {pool.createdAt ? formatAge(pool.createdAt) : NO_VALUE}
      </td>
    </tr>
  );
}
