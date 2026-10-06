"use client";

import { useEffect, useState } from "react";
import type { Pool } from "@/lib/market/gecko";
import { formatUsd, formatCount } from "@/lib/format";
import { clsx } from "@/lib/clsx";

/**
 * What the chain did in the last day, under the hero.
 *
 * The page opens on a claim about a chain most visitors have never traded on.
 * Four live numbers answer the question that claim provokes, which is whether
 * anything is actually happening here, and they answer it before any board has
 * to be read.
 *
 * These describe Robinhood Chain rather than this site. That distinction
 * is deliberate and the labels say so: quoting our own launchpad's volume while
 * it has launched nothing would be a row of zeros, and quoting the chain's
 * volume as if it were ours would be a lie. The chain is the honest subject and
 * it is also the interesting one.
 *
 * Refreshed on a timer rather than pushed. There is no socket here, the
 * upstream is a rate-limited free tier, and a minute is well inside the
 * usefulness of a 24-hour figure.
 */
export function ChainStats({
  initial,
  poolCount,
}: {
  initial: Pool[];
  /** Every pool we have indexed, which is the honest size of the market. */
  poolCount: number | null;
}) {
  const [pools, setPools] = useState<Pool[]>(initial);

  useEffect(() => {
    let live = true;

    async function pull() {
      try {
        const res = await fetch("/api/pools?feed=top", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as Pool[];
        if (live && Array.isArray(next) && next.length > 0) setPools(next);
      } catch {
        // The numbers on screen stay as they are. A stale figure beats a dash.
      }
    }

    const id = setInterval(pull, 60_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  const volume = pools.reduce((sum, p) => sum + (p.volume24hUsd ?? 0), 0);
  const trades = pools.reduce(
    (sum, p) => sum + (p.buys24h ?? 0) + (p.sells24h ?? 0),
    0,
  );
  const liquidity = pools.reduce((sum, p) => sum + (p.liquidityUsd ?? 0), 0);
  /**
   * The whole chain, not the slice we priced.
   *
   * This counted pools in the feed, which is capped at what the provider will
   * serve, so it read "100 pairs trading" on a chain with 3,410 of them.
   *
   * Labelled "indexed" rather than "on chain" because that is the claim we can
   * actually stand behind: it is the size of our own index, refreshed daily,
   * not an assertion about the chain at this instant.
   */
  const pairs = poolCount ?? pools.filter((p) => (p.volume24hUsd ?? 0) > 0).length;

  return (
    <div className="gutter">
      <dl
        className={clsx(
          "grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line-soft bg-line-soft",
          "md:grid-cols-4",
        )}
      >
        <Stat label="Volume, 24h" value={formatUsd(volume)} />
        <Stat label="Trades, 24h" value={formatCount(trades)} />
        <Stat label="Liquidity" value={formatUsd(liquidity)} />
        <Stat label="Pairs indexed" value={formatCount(pairs)} />
      </dl>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ground px-4 py-4 md:px-5 md:py-5">
      {/* Value first, name under it. A small label above a number is the
          eyebrow shape, and a stat tile does not need one to be read. */}
      <dd className="tnum text-lead font-semibold text-ink md:text-h2 md:leading-none">
        {value}
      </dd>
      <dt className="mt-1.5 text-micro text-ink-3">{label}</dt>
    </div>
  );
}
