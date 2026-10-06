"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  readRules,
  reading,
  triggered,
  writeRules,
  type Metric,
  type Rule,
} from "@/lib/alerts/store";
import Link from "next/link";
import { Card } from "@/components/primitives/Card";
import { Select } from "@/components/primitives/Select";
import { TokenLogo } from "@/components/market/TokenLogo";
import { Delta } from "@/components/primitives/Delta";
import { clsx } from "@/lib/clsx";
import { formatUsd, formatPrice } from "@/lib/format";
import type { Pool } from "@/lib/market/gecko";

/**
 * Alerts.
 *
 * Rules are held in this browser rather than on a server, and evaluated against
 * the same market data the boards render from. That is a real limitation and it
 * is stated on the page: nothing fires while the tab is closed.
 *
 * It is also the honest version of what can be built today. Server-side
 * evaluation needs the indexer and a delivery channel, neither of which exists,
 * and a rule builder that silently never fires would be worse than no rule
 * builder at all.
 */


const METRICS: { value: Metric; label: string; unit: string }[] = [
  { value: "price_above", label: "Price rises above", unit: "$" },
  { value: "price_below", label: "Price falls below", unit: "$" },
  { value: "change_above", label: "1h move exceeds", unit: "%" },
  { value: "liquidity_below", label: "Liquidity falls below", unit: "$" },
];

export function AlertsPanel({ pools }: { pools: Pool[] }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [pool, setPool] = useState("");
  const [metric, setMetric] = useState<Metric>("price_above");
  const [value, setValue] = useState("");

  const byAddress = useMemo(
    () => new Map(pools.map((p) => [p.address, p])),
    [pools],
  );

  // Read after mount, never during render: the server has no localStorage, and
  // seeding state from it would make the first client render disagree.
  useEffect(() => {
    setRules(readRules());
    setLoaded(true);
  }, []);

  const persist = useCallback((next: Rule[]) => {
    setRules(next);
    // Through the store, so the nav badge hears about it. Writing the key
    // directly here is what would let the two drift apart.
    writeRules(next);
  }, []);

  const selected = byAddress.get(pool);
  const unit = METRICS.find((m) => m.value === metric)?.unit ?? "";
  const numeric = Number(value);
  const valid = pool !== "" && value !== "" && Number.isFinite(numeric) && numeric > 0;

  function add() {
    if (!valid || !selected) return;
    persist([
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        pool,
        symbol: selected.symbol,
        metric,
        value: numeric,
      },
      ...rules,
    ]);
    setValue("");
  }

  const firing = rules.filter((r) => triggered(r, byAddress.get(r.pool)));

  return (
    <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
      {/* ── Builder ─────────────────────────────────────────────────── */}
      <Card className="p-5 lg:col-span-5">
        <h2 className="text-lead font-semibold text-ink">New alert</h2>

        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-body font-medium text-ink">Token</span>
            {/* Searchable, because this list is every pool on the chain and
                a native select can only jump to a first letter. */}
            <Select
              ariaLabel="Token"
              value={pool}
              onChange={setPool}
              placeholder="Pick a token"
              searchable
              options={pools.map((p) => ({
                value: p.address,
                label: `${p.symbol} / ${p.quoteSymbol}`,
                hint: p.symbol,
                icon: (
                  <TokenLogo
                    symbol={p.symbol}
                    address={p.baseTokenAddress ?? p.address}
                    src={p.imageUrl}
                    size={20}
                  />
                ),
              }))}
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-body font-medium text-ink">Condition</span>
            <Select
              ariaLabel="Condition"
              value={metric}
              onChange={(v) => setMetric(v as Metric)}
              options={METRICS.map((m) => ({ value: m.value, label: m.label }))}
            />
          </div>

          <label className="flex flex-col gap-2">
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-body font-medium text-ink">Value</span>
              {selected && (
                <span className="tnum text-micro text-ink-3">
                  now{" "}
                  {metric === "change_above"
                    ? `${(reading(selected, metric) ?? 0).toFixed(1)}%`
                    : metric === "liquidity_below"
                      ? formatUsd(selected.liquidityUsd)
                      : formatPrice(selected.priceUsd)}
                </span>
              )}
            </span>
            <div className="relative">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                className={clsx(INPUT, "tnum pr-10")}
              />
              <span className="tnum absolute inset-y-0 right-3 flex items-center text-body text-ink-3">
                {unit}
              </span>
            </div>
          </label>

          <button
            type="button"
            onClick={add}
            disabled={!valid}
            className={clsx(
              "rounded-md px-4 py-2.5 text-body font-semibold transition-opacity duration-100",
              valid
                ? "bg-green text-on-accent hover:opacity-90"
                : "border border-line text-ink-3",
            )}
          >
            {valid ? "Add alert" : "Pick a token and a value"}
          </button>
        </div>

        <p className="mt-4 text-micro text-ink-3">
          Rules are stored in this browser and checked whenever this page loads.
          Nothing fires while the tab is closed. Delivery outside the app needs
          the indexer, which is not running yet.
        </p>
      </Card>

      {/* ── Rules ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:col-span-7">
        {firing.length > 0 && (
          <Card className="border-green-line p-5">
            <h2 className="text-lead font-semibold text-green">
              {firing.length} {firing.length === 1 ? "alert" : "alerts"} firing
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {firing.map((r) => (
                <li key={r.id} className="text-body text-ink-2">
                  <span className="font-medium text-ink">{r.symbol}</span>{" "}
                  {METRICS.find((m) => m.value === r.metric)?.label.toLowerCase()}{" "}
                  <span className="tnum text-ink">
                    {r.metric === "change_above" ? `${r.value}%` : `$${r.value}`}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="overflow-hidden">
          <div className="border-b border-line-soft px-4 py-2.5">
            <span className="text-body font-semibold text-ink">Your alerts</span>
          </div>

          {!loaded ? (
            <p className="px-4 py-10 text-body text-ink-3">Loading</p>
          ) : rules.length === 0 ? (
            <p className="px-4 py-10 text-body text-ink-3">
              No alerts yet. Build one on the left.
            </p>
          ) : (
            <ul className="flex flex-col">
              {rules.map((r) => {
                const p = byAddress.get(r.pool);
                const on = triggered(r, p);
                return (
                  <li
                    key={r.id}
                    className="flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1">
                      <Link
                        href={`/t/${r.pool}`}
                        className="block truncate text-body font-medium text-ink transition-colors duration-100 hover:text-green"
                      >
                        {r.symbol}
                      </Link>
                      <span className="block truncate text-micro text-ink-3">
                        {METRICS.find((m) => m.value === r.metric)?.label}{" "}
                        {r.metric === "change_above"
                          ? `${r.value}%`
                          : `$${r.value}`}
                        {/* Said in words rather than by a coloured dot. */}
                        {on && <span className="ml-2 text-green">Firing</span>}
                      </span>
                    </span>

                    {p && (
                      <span className="shrink-0 text-right">
                        <span className="tnum block text-body text-ink">
                          {formatPrice(p.priceUsd)}
                        </span>
                        <Delta value={p.change1h} digits={1} size="sm" />
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        persist(rules.filter((x) => x.id !== r.id))
                      }
                      aria-label={`Delete alert for ${r.symbol}`}
                      className="shrink-0 rounded-md border border-line px-2 py-1 text-micro text-ink-3 transition-colors duration-100 hover:border-red-line hover:text-red"
                    >
                      Delete
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

const INPUT =
  "w-full rounded-md border border-line bg-surface-2 px-3 py-2.5 text-body text-ink " +
  "placeholder:text-ink-3 focus:border-green focus:outline-none";
