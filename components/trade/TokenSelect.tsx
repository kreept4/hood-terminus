"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TokenLogo } from "@/components/market/TokenLogo";
import { Delta } from "@/components/primitives/Delta";
import { clsx } from "@/lib/clsx";
import { formatUsd } from "@/lib/format";
import type { Pool } from "@/lib/market/gecko";

/**
 * Picking a token.
 *
 * A native `select` was wrong for this. It shows one line of unstyled text per
 * option, cannot carry a logo, cannot be searched, and on a phone it hands the
 * whole thing to the operating system's picker. None of that suits choosing
 * between sixty tokens that are mostly distinguished by their artwork and their
 * liquidity.
 *
 * This is a button that opens a searchable list: logo, ticker, liquidity, and
 * the move, which is what someone actually reads when choosing what to trade.
 */
export function TokenSelect({
  pools,
  logos,
  value,
  onChange,
}: {
  pools: Pool[];
  logos: Record<string, string>;
  value: string;
  onChange: (address: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement | null>(null);

  const selected = pools.find((p) => p.address === value) ?? null;

  useEffect(() => {
    if (!open) return;
    search.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pools;
    return pools.filter(
      (p) =>
        p.symbol.toLowerCase().includes(q) ||
        p.baseTokenAddress?.toLowerCase().includes(q),
    );
  }, [pools, query]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setQuery("");
        }}
        className="flex w-full items-center gap-3 rounded-md border border-line bg-surface-2 px-3 py-2.5 text-left transition-colors duration-100 hover:border-green"
      >
        {selected ? (
          <>
            <TokenLogo
              symbol={selected.symbol}
              address={selected.baseTokenAddress ?? selected.address}
              src={logos[selected.baseTokenAddress?.toLowerCase() ?? ""]}
              size={26}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-medium text-ink">
                {selected.symbol}
              </span>
              <span className="block truncate text-micro text-ink-3">
                {formatUsd(selected.liquidityUsd)} liquidity
              </span>
            </span>
          </>
        ) : (
          <span className="flex-1 text-body text-ink-3">Pick a token</span>
        )}
        <Chevron />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ground/80 backdrop-blur-sm md:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choose a token"
            className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-t-lg border border-line-soft bg-surface md:rounded-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-line-soft p-4">
              <input
                ref={search}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ticker or address"
                spellCheck={false}
                className="w-full rounded-md border border-line bg-surface-2 px-3 py-2.5 text-body text-ink placeholder:text-ink-3 focus:border-green focus:outline-none"
              />
            </div>

            <ul className="min-h-0 flex-1 overflow-y-auto">
              {filtered.length === 0 && (
                <li className="px-4 py-10 text-center text-body text-ink-3">
                  Nothing matches that.
                </li>
              )}
              {filtered.map((p) => (
                <li key={p.address}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(p.address);
                      setOpen(false);
                    }}
                    className={clsx(
                      "flex w-full items-center gap-3 border-b border-line-soft px-4 py-3 text-left last:border-b-0",
                      "transition-colors duration-100 hover:bg-surface-2",
                      p.address === value && "bg-surface-2",
                    )}
                  >
                    <TokenLogo
                      symbol={p.symbol}
                      address={p.baseTokenAddress ?? p.address}
                      src={logos[p.baseTokenAddress?.toLowerCase() ?? ""]}
                      size={30}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-medium text-ink">
                        {p.symbol}
                      </span>
                      <span className="block truncate text-micro text-ink-3">
                        {formatUsd(p.liquidityUsd)} liquidity
                      </span>
                    </span>
                    <Delta value={p.change24h} digits={1} size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

function Chevron() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-ink-3"
    >
      <path
        d="M2.8 4.4 6 7.6l3.2-3.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
