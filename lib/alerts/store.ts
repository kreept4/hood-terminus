"use client";

import { useEffect, useState } from "react";
import type { Pool } from "@/lib/market/gecko";

/**
 * Where alert rules live, and how anything else finds out they changed.
 *
 * The rules are in localStorage because they are this browser's, not this
 * account's: there is no sign-in, so there is nowhere else to put them that
 * would still be theirs. The panel owns them, but the nav has to count them,
 * and two components reading the same key independently is how a badge ends up
 * showing a number that is one edit out of date.
 *
 * So writes go through `writeRules`, which fires an event. The browser's own
 * `storage` event only fires in *other* tabs, which is exactly backwards for a
 * badge sitting next to the form that just changed: the tab doing the writing
 * is the one that must update first. Hence a custom event for this tab and the
 * native one for the rest.
 */

export const ALERTS_KEY = "ht:alerts";

/** Fired in this tab on every write. The native `storage` event covers others. */
const CHANGED = "ht:alerts-changed";

export type Metric =
  | "price_above"
  | "price_below"
  | "change_above"
  | "liquidity_below";

export type Rule = {
  id: string;
  pool: string;
  symbol: string;
  metric: Metric;
  value: number;
};

export function readRules(): Rule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Rule[]) : [];
  } catch {
    // Private mode, a full quota, or something else having written the key.
    return [];
  }
}

export function writeRules(rules: Rule[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ALERTS_KEY, JSON.stringify(rules));
  } catch {
    // Storage being unavailable must not take the form down with it.
  }
  window.dispatchEvent(new CustomEvent(CHANGED));
}

/** The reading a rule is about, from a pool's current numbers. */
export function reading(pool: Pool, metric: Metric): number | null {
  switch (metric) {
    case "price_above":
    case "price_below":
      return pool.priceUsd;
    case "change_above":
      return pool.change1h === null ? null : Math.abs(pool.change1h);
    case "liquidity_below":
      return pool.liquidityUsd;
  }
}

/** Is this rule's condition true right now? */
export function triggered(rule: Rule, pool: Pool | undefined): boolean {
  if (!pool) return false;
  const now = reading(pool, rule.metric);
  if (now === null) return false;
  switch (rule.metric) {
    case "price_above":
    case "change_above":
      return now > rule.value;
    case "price_below":
    case "liquidity_below":
      return now < rule.value;
  }
}

/**
 * How many alerts are actually firing.
 *
 * Deliberately not the number of rules. A badge showing how many alerts exist
 * looks exactly like a badge showing how many need attention, so it read as a
 * standing false alarm: a number that never moved and never meant anything had
 * happened. A count of conditions currently true is the only version of this
 * worth putting on a nav item.
 *
 * Zero until mounted, because the server cannot know it and rendering a guess
 * during hydration would mismatch.
 */
export function useFiringAlerts(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const rules = readRules();
      if (rules.length === 0) {
        if (!cancelled) setCount(0);
        return;
      }

      try {
        // The screener feed, which is already cached server side and is the
        // same data the alerts page evaluates against.
        const res = await fetch("/api/pools?feed=top");
        if (!res.ok) return;
        const body = (await res.json()) as { pools?: Pool[] };
        const byAddress = new Map(
          (body.pools ?? []).map((p) => [p.address.toLowerCase(), p]),
        );
        const firing = rules.filter((r) =>
          triggered(r, byAddress.get(r.pool.toLowerCase())),
        ).length;
        if (!cancelled) setCount(firing);
      } catch {
        // Leave the last known count rather than flashing to zero.
      }
    }

    void check();
    window.addEventListener(CHANGED, check);
    window.addEventListener("storage", check);

    // Prices move. Re-checking on an interval is what makes this a
    // notification rather than a snapshot from whenever the tab opened.
    const timer = window.setInterval(check, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(CHANGED, check);
      window.removeEventListener("storage", check);
    };
  }, []);

  return count;
}
