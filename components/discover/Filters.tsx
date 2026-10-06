"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { WINDOWS, type Window, type ScreenSort } from "@/lib/market/gecko";
import { clsx } from "@/lib/clsx";

/**
 * Screener controls.
 *
 * Two rows with different jobs. The board is a set of tabs sitting on the top
 * edge of the table, because choosing a board is choosing what the table is;
 * window and liquidity are settings applied to it, so they sit below in a
 * quieter row. An earlier version put all three groups in one line of
 * identical pills, which made a choice of subject look like a choice of filter.
 *
 * State lives in the URL rather than in React, so a view worth watching can be
 * bookmarked or sent to someone, and the server renders the right board on the
 * first request instead of flashing the default and correcting itself.
 */

/**
 * The boards, each with a mark.
 *
 * Seven words in a row all set the same way is a list, not a set of choices:
 * nothing distinguishes one from another until it is read, and the selected one
 * is told apart only by an underline. A mark gives each a shape the eye can
 * find without reading, which is what makes a tab strip scannable at a glance.
 *
 * Drawn from one 24-unit grid at a single stroke weight so they read as one
 * family rather than seven borrowed glyphs, and each one says what its board
 * sorts by rather than decorating it: a rising line for trending, a falling one
 * for losers, bars for volume, stacked layers for depth.
 */
const SORTS: { value: ScreenSort; label: string; Icon: () => React.ReactElement }[] = [
  { value: "trending", label: "Trending", Icon: IconTrending },
  { value: "new", label: "New pairs", Icon: IconNew },
  { value: "curve", label: "On the curve", Icon: IconCurve },
  { value: "gainers", label: "Gainers", Icon: IconUp },
  { value: "losers", label: "Losers", Icon: IconDown },
  { value: "volume", label: "Volume", Icon: IconVolume },
  { value: "liquidity", label: "Liquidity", Icon: IconDepth },
];

/** One grid, one stroke weight, so the set reads as a set. */
function mark(path: React.ReactNode) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {path}
    </svg>
  );
}

function IconTrending() {
  return mark(<><path d="M3 16.5 9 10l4 4 7.5-7.5" /><path d="M15 6.5h5.5V12" /></>);
}
function IconNew() {
  return mark(<><path d="M12 4v16M4 12h16" /><path d="M7 7l1.2 1.2M17 17l-1.2-1.2M17 7l-1.2 1.2M7 17l1.2-1.2" /></>);
}
function IconCurve() {
  return mark(<><path d="M3 19c5 0 8-3 10-7s5-7 8-7" /><path d="M3 19h18" /></>);
}
function IconUp() {
  return mark(<><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></>);
}
function IconDown() {
  return mark(<><path d="M12 5v14" /><path d="M6 13l6 6 6-6" /></>);
}
function IconVolume() {
  return mark(<><path d="M4 20V13" /><path d="M9.3 20V8" /><path d="M14.7 20V11" /><path d="M20 20V5" /></>);
}
function IconDepth() {
  return mark(<><path d="M12 3.5 21 8l-9 4.5L3 8z" /><path d="M3 13l9 4.5L21 13" /></>);
}

const LIQUIDITY: { value: number; label: string }[] = [
  { value: 0, label: "Any" },
  { value: 1_000, label: "$1k" },
  { value: 5_000, label: "$5k" },
  { value: 25_000, label: "$25k" },
  { value: 100_000, label: "$100k" },
];

export function Filters({
  sort,
  window,
  minLiquidity,
  query,
  quote,
  quotes,
}: {
  sort: ScreenSort;
  window: Window;
  minLiquidity: number;
  query: string;
  quote: string;
  /** The quote assets actually present, commonest first. */
  quotes: { symbol: string; count: number }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      next.set(key, value);
      // scroll: false so changing a filter does not throw the board the reader
      // is looking at back to the top of the page.
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  /**
   * The search box is typed into locally and pushed to the URL on a pause.
   *
   * Writing every keystroke to the URL would re-render the server component and
   * refetch on every letter. A third of a second is long enough that a word is
   * one navigation and short enough that it never feels held back.
   */
  const [text, setText] = useState(query);

  useEffect(() => {
    setText(query);
  }, [query]);

  useEffect(() => {
    if (text === query) return;
    const id = setTimeout(() => set("q", text), 320);
    return () => clearTimeout(id);
  }, [text, query, set]);

  return (
    <div>
      {/* ── Search, above the boards, because it searches all of them ─ */}
      <div className="flex items-center gap-2 border-b border-line-soft px-3 py-2.5">
        <IconSearch />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search by name, ticker or contract address"
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-body text-ink placeholder:text-ink-3 focus:outline-none"
        />
        {text !== "" && (
          <button
            type="button"
            onClick={() => {
              setText("");
              set("q", "");
            }}
            className="shrink-0 rounded-md px-2 py-1 text-micro text-ink-3 transition-colors duration-100 hover:text-ink"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Board tabs, sitting on the table's edge ─────────────────── */}
      <div
        role="tablist"
        aria-label="Board"
        className="scroll-x flex gap-1 border-b border-line-soft px-2 pt-2"
      >
        {SORTS.map((s) => {
          const active = sort === s.value;
          return (
            <button
              key={s.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => set("sort", s.value)}
              className={clsx(
                "relative shrink-0 px-3 py-2.5 text-body whitespace-nowrap",
                "transition-colors duration-100",
                active ? "font-medium text-ink" : "text-ink-3 hover:text-ink",
              )}
            >
              <span className="flex items-center gap-1.5">
                <s.Icon />
                {s.label}
              </span>
              {/* Sits on the container's border rather than under the label, so
                  the tab reads as attached to the table below it. */}
              <span
                aria-hidden="true"
                className={clsx(
                  "absolute inset-x-2 -bottom-px h-0.5 rounded-full",
                  active ? "bg-green" : "bg-transparent",
                )}
              />
            </button>
          );
        })}
      </div>

      {/* ── Settings ────────────────────────────────────────────────── */}
      <div className="scroll-x flex items-center gap-2 border-b border-line-soft px-3 py-2.5">
        <Segmented
          label="Window"
          options={WINDOWS.map((w) => ({ value: w, label: w }))}
          value={window}
          onChange={(v) => set("t", v)}
        />
        <span className="h-5 w-px shrink-0 bg-line-soft" aria-hidden="true" />
        <Segmented
          label="Minimum liquidity"
          options={LIQUIDITY.map((l) => ({
            value: String(l.value),
            label: l.label,
          }))}
          value={String(minLiquidity)}
          onChange={(v) => set("liq", v)}
        />

        {/* Only when there is a choice to make. On a chain where everything
            happened to pair against one asset, a filter offering that one
            asset is a control that does nothing. */}
        {quotes.length > 1 && (
          <>
            <span className="h-5 w-px shrink-0 bg-line-soft" aria-hidden="true" />
            <Segmented
              label="Paired with"
              options={[
                { value: "", label: "Any" },
                ...quotes.slice(0, 6).map((q) => ({
                  value: q.symbol,
                  label: q.symbol,
                })),
              ]}
              value={quote}
              onChange={(v) => set("pair", v)}
            />
          </>
        )}
      </div>
    </div>
  );
}

function IconSearch() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
      className="shrink-0 text-ink-3"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.4 15.4 20 20" />
    </svg>
  );
}

/**
 * One control, not a row of loose buttons. The border belongs to the group and
 * the selected option is filled, which is what makes a set of options read as
 * a single setting with a current value.
 */
function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 items-center rounded-md border border-line-soft bg-surface-2 p-0.5"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              "tnum rounded-sm px-2.5 py-1.5 text-micro whitespace-nowrap",
              "transition-colors duration-100",
              active
                ? "bg-surface text-ink shadow-[0_1px_2px_var(--shadow-1)]"
                : "text-ink-3 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
