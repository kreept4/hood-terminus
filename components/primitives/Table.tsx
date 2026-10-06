import { clsx } from "@/lib/clsx";

export type Column<T> = {
  key: string;
  header: string;
  /** Numbers align right. Text aligns left. Set once, per column. */
  align?: "left" | "right";
  /** Hidden below the md breakpoint. Use for anything the phone can lose. */
  hideOnMobile?: boolean;
  width?: string;
  render: (row: T) => React.ReactNode;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowHref?: (row: T) => string;
  /** Rendered in place of the body when there are no rows. */
  empty?: React.ReactNode;
  className?: string;
};

/**
 * The dense table every list in the product uses. Discover, Wallets, Portfolio
 * and the trade tape all render through this, which is what stops them drifting
 * apart visually as the product grows.
 *
 * Virtualisation is deliberately not here yet. It is added when a real list
 * exceeds a few hundred rows, not in advance of that.
 */
export function Table<T>({
  columns,
  rows,
  rowKey,
  onRowHref,
  empty,
  className,
}: Props<T>) {
  return (
    <div
      className={clsx(
        "overflow-x-auto rounded-md border border-line-soft bg-surface",
        className,
      )}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-surface-2">
            {columns.map((c) => (
              <th
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                className={clsx(
                  "text-micro border-b border-line-soft px-3 py-2 font-normal whitespace-nowrap text-ink-3",
                  c.align === "right" ? "text-right" : "text-left",
                  c.hideOnMobile && "hidden md:table-cell",
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const href = onRowHref?.(row);
              return (
                <tr
                  key={rowKey(row)}
                  className={clsx(
                    "border-b border-line-soft last:border-b-0",
                    href && "hover:bg-surface-2 transition-colors duration-100",
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={clsx(
                        "px-3 py-2 align-middle",
                        c.align === "right" ? "text-right" : "text-left",
                        c.hideOnMobile && "hidden md:table-cell",
                      )}
                    >
                      {href ? (
                        <a href={href} className="block">
                          {c.render(row)}
                        </a>
                      ) : (
                        c.render(row)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
