"use client";

import { useEffect, useState } from "react";

/**
 * Which currency the reader wants the small numbers in.
 *
 * Kept in localStorage because it is this browser's preference and there is no
 * account to hang it on. Same pattern as the alert rules, and the same reason.
 *
 * ETH is never converted away. On a chain where everything is priced and paid
 * in ETH, the balance a reader acts on is the ETH figure, and the fiat number
 * underneath is there to answer "is that a lot" rather than to be traded
 * against. That is why this only ever affects the secondary line.
 */

export const CURRENCIES = ["USD", "GBP", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

const KEY = "ht:currency";
/** Fired in this tab on every write. The native `storage` event covers others. */
const CHANGED = "ht:currency-changed";

const SYMBOL: Record<Currency, string> = { USD: "$", GBP: "£", EUR: "€" };

function read(): Currency {
  if (typeof window === "undefined") return "USD";
  try {
    const raw = localStorage.getItem(KEY);
    return CURRENCIES.includes(raw as Currency) ? (raw as Currency) : "USD";
  } catch {
    // Private mode, or a full quota. Dollars are a fine answer.
    return "USD";
  }
}

export function setCurrency(next: Currency): void {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Storage being unavailable must not stop the switch from taking effect
    // for this session.
  }
  window.dispatchEvent(new CustomEvent(CHANGED));
}

/**
 * The chosen currency, its symbol, and what one dollar is worth in it.
 *
 * Starts on USD at a rate of 1 on every render path, including the server, so
 * the first paint is never wrong in a way that shifts the layout. The stored
 * choice and the live rate arrive after mount.
 */
export function useCurrency(): {
  currency: Currency;
  symbol: string;
  rate: number;
  format: (usd: number | null | undefined) => string;
} {
  const [currency, setLocal] = useState<Currency>("USD");
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 });

  useEffect(() => {
    setLocal(read());

    function sync() {
      setLocal(read());
    }
    window.addEventListener(CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    let live = true;
    fetch("/api/fx")
      .then((r) => r.json())
      .then((data: Record<string, number>) => live && setRates(data))
      .catch(() => {
        // Dollars only. The panel still reads correctly.
      });
    return () => {
      live = false;
    };
  }, []);

  const rate = rates[currency] ?? 1;

  return {
    currency,
    symbol: SYMBOL[currency],
    rate,
    format(usd) {
      if (usd === null || usd === undefined || !Number.isFinite(usd)) return "-";
      const value = usd * rate;
      return (
        SYMBOL[currency] +
        value.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      );
    },
  };
}
