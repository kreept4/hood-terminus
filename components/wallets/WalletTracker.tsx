"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/primitives/Card";
import { clsx } from "@/lib/clsx";
import { truncateAddress } from "@/lib/format";
import { isAddress, useTrackedWallets } from "@/lib/wallets/tracked";

/**
 * The tracker.
 *
 * The ranked list this page was built for needs an indexer that is not running,
 * so there was nothing on it to click. This is the half that does not need one:
 * paste an address and it is tracked, and every tracked wallet gets a page
 * showing what it currently holds, read live from the chain.
 *
 * When the ranking does come online it becomes a second way onto the same
 * pages rather than a replacement for this one.
 */
export function WalletTracker() {
  const { wallets, loaded, track, untrack } = useTrackedWallets();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = value.trim();

    if (!isAddress(clean)) {
      setError("That is not a wallet address. It should start 0x and be 42 characters.");
      return;
    }
    if (!track(clean)) {
      setError("Already tracking that one.");
      return;
    }
    setValue("");
    setError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
          <div className="min-w-0 flex-1">
            <label htmlFor="track-address" className="sr-only">
              Wallet address
            </label>
            <input
              id="track-address"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              placeholder="0x…"
              spellCheck={false}
              autoComplete="off"
              className={clsx(
                "tnum w-full rounded-md border bg-surface-2 px-3 py-2.5 text-body text-ink",
                "placeholder:text-ink-3 focus:outline-none",
                error ? "border-red-line focus:border-red" : "border-line focus:border-green",
              )}
            />
          </div>
          <button
            type="submit"
            className="shrink-0 rounded-md bg-green px-5 py-2.5 text-body font-semibold text-on-accent transition-opacity duration-100 hover:opacity-90"
          >
            Track
          </button>
        </form>

        {error ? (
          <p className="mt-2.5 text-micro text-red">{error}</p>
        ) : (
          <p className="mt-2.5 text-micro text-ink-3">
            Tracked wallets are kept in this browser. Nothing is sent anywhere.
          </p>
        )}
      </Card>

      {loaded && wallets.length === 0 ? (
        <Card className="px-5 py-12">
          <p className="mx-auto max-w-md text-center text-body text-ink-3">
            Nothing tracked yet. Paste an address above, or open any token and
            follow a wallet from its trades.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="flex flex-col">
            {wallets.map((address) => (
              <li
                key={address}
                className="group relative flex items-center gap-3 border-b border-line-soft last:border-b-0 hover:bg-surface-2"
              >
                {/* Stretched over the whole row.

                    Previously only the address text was a link, so most of the
                    row looked clickable and did nothing. The overlay keeps the
                    untrack button above it clickable, which wrapping the row in
                    an anchor would not: a button inside a link is invalid and
                    swallows the click. */}
                <Link
                  href={`/w/${address}`}
                  className="tnum min-w-0 flex-1 truncate px-4 py-3 text-body text-ink transition-colors duration-100 group-hover:text-green after:absolute after:inset-0 after:content-['']"
                >
                  {truncateAddress(address, 8)}
                </Link>
                <button
                  type="button"
                  onClick={() => untrack(address)}
                  className="relative z-10 mr-4 shrink-0 rounded-md border border-line px-2.5 py-1 text-micro text-ink-3 transition-colors duration-100 hover:border-red-line hover:text-red"
                >
                  Untrack
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** The track toggle, for a wallet's own page. */
export function TrackButton({
  address,
  compact = false,
}: {
  address: string;
  /** For a table row, where a full-size button would set the row height. */
  compact?: boolean;
}) {
  const { isTracked, track, untrack, loaded } = useTrackedWallets();
  const on = isTracked(address);

  return (
    <button
      type="button"
      disabled={!loaded}
      onClick={() => (on ? untrack(address) : track(address))}
      className={clsx(
        "rounded-md font-medium transition-colors duration-100",
        compact ? "px-2.5 py-1 text-micro" : "px-4 py-2 text-body",
        on
          ? "border border-line text-ink-2 hover:border-red-line hover:text-red"
          : compact
            ? "border border-line text-ink-2 hover:border-green hover:text-green"
            : "bg-green text-on-accent hover:opacity-90",
      )}
    >
      {on ? "Tracking" : compact ? "Track" : "Track wallet"}
    </button>
  );
}
