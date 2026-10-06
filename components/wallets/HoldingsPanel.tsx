"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/primitives/Card";
import { Delta } from "@/components/primitives/Delta";
import { TokenLogo } from "@/components/market/TokenLogo";
import { clsx } from "@/lib/clsx";
import { formatPrice, formatUsd, NO_VALUE } from "@/lib/format";

/**
 * What a wallet is holding, and how it is split.
 *
 * Balances are read from the chain rather than from an indexer, so this works
 * today and for any address, not only for wallets the product has seen trade.
 *
 * The split is a donut because the question it answers is a proportion: how
 * much of this wallet is one bet. A bar chart of dollar values answers a
 * different question, and a wallet that is 80% one memecoin is the single most
 * useful thing to be able to see at a glance.
 */

type Holding = {
  address: string;
  symbol: string;
  amount: number;
  priceUsd: number | null;
  valueUsd: number | null;
  poolAddress: string | null;
  change24h: number | null;
  imageUrl: string | null;
  native: boolean;
};

type Portfolio = {
  holdings: Holding[];
  totalUsd: number;
  tokensUsd: number;
  nativeUsd: number;
  reachable: boolean;
};

/**
 * Slice colours.
 *
 * A ramp built from the brand hue rather than a rainbow: the accent already
 * means "up" everywhere else, so a chart that introduces six unrelated hues
 * would be the only place in the product where colour means nothing. The gas
 * token gets the neutral at the end, because it is not a position.
 */
const SLICES = [
  "var(--color-green)",
  "#a8d400",
  "#83a800",
  "#5f7c00",
  "#42560a",
  "#2b3610",
];
const REST = "var(--color-line)";

export function HoldingsPanel({ address }: { address: string }) {
  const [data, setData] = useState<Portfolio | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let live = true;
    setState("loading");

    fetch(`/api/portfolio?address=${address}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad response"))))
      .then((json: Portfolio) => {
        if (!live) return;
        setData(json);
        setState(json.reachable ? "ready" : "failed");
      })
      .catch(() => live && setState("failed"));

    return () => {
      live = false;
    };
  }, [address]);

  if (state === "loading") {
    return (
      <Card className="px-5 py-12">
        <p className="text-center text-body text-ink-3">Reading balances</p>
      </Card>
    );
  }

  if (state === "failed" || !data) {
    return (
      <Card className="px-5 py-12">
        <p className="text-center text-body text-ink-3">
          Could not reach the chain. Nothing here is stale, it is simply absent.
        </p>
      </Card>
    );
  }

  if (data.holdings.length === 0) {
    return (
      <Card className="px-5 py-12">
        <p className="mx-auto max-w-md text-center text-body text-ink-3">
          Nothing held in any token with a live market on this chain, and no ETH.
        </p>
      </Card>
    );
  }

  const priced = data.holdings.filter((h) => (h.valueUsd ?? 0) > 0);
  const total = priced.reduce((sum, h) => sum + (h.valueUsd ?? 0), 0);

  // Anything under two percent becomes one slice. Six named slices is the most
  // a donut this size can label; past that the legend is longer than the chart.
  const named = priced.slice(0, 6);
  const rest = priced.slice(6);
  const restValue = rest.reduce((sum, h) => sum + (h.valueUsd ?? 0), 0);

  const slices = [
    ...named.map((h, i) => ({
      label: h.symbol,
      value: h.valueUsd ?? 0,
      colour: SLICES[i] ?? REST,
    })),
    ...(restValue > 0
      ? [{ label: `${rest.length} more`, value: restValue, colour: REST }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5 md:p-6">
        <div className="grid gap-8 md:grid-cols-12 md:gap-10">
          <div className="md:col-span-4">
            <p className="text-body text-ink-3">Total value</p>
            <p className="tnum mt-1.5 text-h1 leading-none font-bold text-ink">
              {formatUsd(total)}
            </p>
            <dl className="mt-6 flex flex-col gap-3 border-t border-line-soft pt-5">
              <Row label="In tokens" value={formatUsd(data.tokensUsd)} />
              <Row label="In ETH" value={formatUsd(data.nativeUsd)} />
              <Row label="Positions" value={String(priced.length)} />
            </dl>
          </div>

          <div className="flex items-center gap-6 md:col-span-8">
            <Donut slices={slices} total={total} />
            <ul className="flex min-w-0 flex-1 flex-col gap-2.5">
              {slices.map((s) => (
                <li key={s.label} className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-xs"
                    style={{ background: s.colour }}
                  />
                  <span className="min-w-0 flex-1 truncate text-body text-ink">
                    {s.label}
                  </span>
                  <span className="tnum shrink-0 text-body text-ink-2">
                    {total > 0 ? `${((s.value / total) * 100).toFixed(1)}%` : NO_VALUE}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line-soft text-ink-3">
                <th className="px-4 py-2 text-micro font-normal">Token</th>
                <th className="px-3 py-2 text-right text-micro font-normal">
                  Amount
                </th>
                <th className="hidden px-3 py-2 text-right text-micro font-normal sm:table-cell">
                  Price
                </th>
                <th className="px-3 py-2 text-right text-micro font-normal">
                  Value
                </th>
                <th className="hidden py-2 pr-4 text-right text-micro font-normal sm:table-cell">
                  24h
                </th>
              </tr>
            </thead>
            <tbody>
              {data.holdings.map((h) => (
                <tr
                  key={h.address}
                  className="group border-b border-line-soft last:border-b-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <TokenLogo
                        symbol={h.symbol}
                        address={h.address}
                        src={h.imageUrl}
                        size={26}
                      />
                      {h.poolAddress ? (
                        <Link
                          href={`/t/${h.poolAddress}`}
                          className="text-body font-medium text-ink transition-colors duration-100 group-hover:text-green"
                        >
                          {h.symbol}
                        </Link>
                      ) : (
                        <span className="text-body font-medium text-ink">
                          {h.symbol}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="tnum px-3 py-2.5 text-right text-body text-ink-2">
                    {compact(h.amount)}
                  </td>
                  <td className="tnum hidden px-3 py-2.5 text-right text-body text-ink-2 sm:table-cell">
                    {formatPrice(h.priceUsd)}
                  </td>
                  <td className="tnum px-3 py-2.5 text-right text-body text-ink">
                    {h.valueUsd === null ? NO_VALUE : formatUsd(h.valueUsd)}
                  </td>
                  <td className="hidden py-2.5 pr-4 text-right sm:table-cell">
                    <Delta value={h.change24h} digits={1} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-body text-ink-3">{label}</dt>
      <dd className="tnum text-body text-ink">{value}</dd>
    </div>
  );
}

/**
 * The donut.
 *
 * Drawn with `stroke-dasharray` on one circle per slice rather than with arc
 * paths: no trigonometry, no rounding errors where two arcs meet, and the ring
 * closes exactly however the percentages fall.
 */
function Donut({
  slices,
  total,
}: {
  slices: { label: string; value: number; colour: string }[];
  total: number;
}) {
  const R = 42;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <svg
      viewBox="0 0 120 120"
      className="h-32 w-32 shrink-0 -rotate-90 md:h-40 md:w-40"
      role="img"
      aria-label="Holdings by share of total value"
    >
      {total > 0 &&
        slices.map((s) => {
          const share = s.value / total;
          const length = share * C;
          const circle = (
            <circle
              key={s.label}
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={s.colour}
              strokeWidth="16"
              strokeDasharray={`${length} ${C - length}`}
              strokeDashoffset={-offset}
            />
          );
          offset += length;
          return circle;
        })}
    </svg>
  );
}

/** Token amounts run from eight decimals to twelve digits. Both must fit. */
function compact(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(2)}K`;
  if (v >= 1) return v.toFixed(3);
  return v.toPrecision(3);
}
