"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The wallets this browser is tracking.
 *
 * Local, not server-side. Following a wallet needs an account to hang the list
 * off, and there are no accounts. Local storage is the version that works today
 * and it degrades honestly: the list is this browser's, and the UI says so.
 *
 * A storage event listener keeps two open tabs in step, and a custom event does
 * the same for two components in the same tab, since `storage` does not fire in
 * the tab that wrote it.
 */

const KEY = "ht:tracked";
const CHANGED = "ht:tracked-changed";

export function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && isAddress(v));
  } catch {
    return [];
  }
}

function write(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Site data blocked. The list still holds for this page view.
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function useTrackedWallets() {
  const [wallets, setWallets] = useState<string[]>([]);
  // Distinguishes "nothing tracked" from "not read yet", so the empty state
  // does not flash on every load.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    function sync() {
      setWallets(read());
    }
    sync();
    setLoaded(true);

    window.addEventListener(CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const track = useCallback((address: string) => {
    const clean = address.trim().toLowerCase();
    if (!isAddress(clean)) return false;
    const list = read();
    if (list.includes(clean)) return false;
    write([clean, ...list]);
    return true;
  }, []);

  const untrack = useCallback((address: string) => {
    const clean = address.trim().toLowerCase();
    write(read().filter((a) => a !== clean));
  }, []);

  const isTracked = useCallback(
    (address: string) => wallets.includes(address.trim().toLowerCase()),
    [wallets],
  );

  return { wallets, loaded, track, untrack, isTracked };
}
