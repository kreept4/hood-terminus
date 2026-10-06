"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/primitives/Card";
import { truncateAddress } from "@/lib/format";
import { useTrackedWallets } from "@/lib/wallets/tracked";

/**
 * What the wallets you follow have just done.
 *
 * This belongs on the alerts page rather than beside the tracker, because it
 * answers the same question the rest of this page does: what happened that I
 * asked to be told about. The tracker is where you choose who to watch; this
 * is the watching.
 *
 * Read-only and polled. A push notification needs a server that knows who you
 * are, and there is no sign-in here, so the honest version is a list that
 * refreshes while the page is open rather than one that claims to reach you
 * when it is closed.
 */

type Trade = {
  pool_address: string;
  wallet_address: string;
  amount0_in: string;
  amount1_in: string;
  amount0_out: string;
  amount1_out: string;
  created_at: string;
};

export function TrackedActivity() {
  const { wallets, loaded } = useTrackedWallets();
  const [trades, setTrades] = useState<Trade[] | null>(null);

  useEffect(() => {
    if (!loaded || wallets.length === 0) {
      setTrades([]);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/wallet-activity", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ wallets }),
        });
        if (!res.ok) return;
        const body = (await res.json()) as { trades?: Trade[] };
        if (!cancelled) setTrades(body.trades ?? []);
      } catch {
        // Keep whatever is on screen rather than blanking it.
      }
    }

    void load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loaded, wallets]);

  if (!loaded) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-h2 leading-none font-bold tracking-tight text-ink">
        Wallets you follow
      </h2>

      {wallets.length === 0 ? (
        <Card className="px-5 py-10">
          <p className="mx-auto max-w-md text-center text-body text-ink-3">
            You are not following any wallets.{" "}
            <Link href="/wallets" className="text-green hover:underline">
              Find some to track
            </Link>
            .
          </p>
        </Card>
      ) : trades === null ? (
        <Card className="px-5 py-10">
          <p className="text-center text-body text-ink-3">Loading.</p>
        </Card>
      ) : trades.length === 0 ? (
        <Card className="px-5 py-10">
          <p className="mx-auto max-w-md text-center text-body text-ink-3">
            Nothing from those wallets yet.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="flex flex-col">
            {trades.map((t, i) => (
              <li
                key={`${t.wallet_address}-${t.created_at}-${i}`}
                className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3 last:border-b-0"
              >
                <span className="flex min-w-0 flex-col">
                  <Link
                    href={`/w/${t.wallet_address}`}
                    className="tnum truncate text-body text-ink hover:text-green"
                  >
                    {truncateAddress(t.wallet_address, 6)}
                  </Link>
                  <Link
                    href={`/t/${t.pool_address}`}
                    className="truncate text-micro text-ink-3 hover:text-green"
                  >
                    {truncateAddress(t.pool_address, 6)}
                  </Link>
                </span>
                <span className="shrink-0 text-micro text-ink-2" suppressHydrationWarning>
                  {age(t.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

/** Relative, and marked as client-only where it is rendered. */
function age(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
