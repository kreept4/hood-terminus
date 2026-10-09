"use client";

import { useCallback } from "react";
import { useSyncExternalStore } from "react";
import { useAccount } from "wagmi";

/**
 * The assistant's name, which belongs to a wallet.
 *
 * The check has a name because a name is repeatable. "Run it through the
 * pre-trade sell simulator" is an instruction about software; "ask Travis" is a
 * habit, and a habit is the thing worth building.
 *
 * It is a default rather than a brand, and people can change it. Somebody who
 * renames him has decided he is theirs, which is the whole point of giving him
 * a name in the first place.
 *
 * Which is exactly why it is stored against the wallet and not the browser. It
 * used to be one key for the whole browser, so a name outlived the person who
 * chose it: disconnect, and the next visitor on that machine was greeted by a
 * stranger's private nickname with no way to account for it. Someone who has
 * not connected anything has not named him, so he is Travis.
 *
 * Still only in this browser, and still never sent to us. Keying by address is
 * how the preference is scoped, not a claim that we know whose wallet it is.
 */

export const DEFAULT_ASSISTANT = "Travis";

const PREFIX = "ht:assistant:";
const CHANGED = "ht:assistant-changed";

/** 24 is long enough for any name and short enough to fit the header. */
const MAX = 24;

export function cleanName(input: string): string {
  // Collapse whitespace so a name cannot be padded into breaking a layout, and
  // fall back rather than ever rendering an empty label.
  const trimmed = input.replace(/\s+/g, " ").trim().slice(0, MAX);
  return trimmed || DEFAULT_ASSISTANT;
}

/** One wallet, one key. Lowercased, because address casing is a checksum. */
function keyFor(address: string): string {
  return PREFIX + address.toLowerCase();
}

/**
 * Cached per key, because `useSyncExternalStore` compares snapshots by identity
 * and a fresh string every call would re-render forever. Keyed by address
 * rather than held as one value, so switching wallets cannot serve the
 * previous one's name from the cache.
 */
const names = new Map<string, string>();
const raws = new Map<string, string | null>();

function snapshotFor(address: string | null): string {
  // Nobody connected means nobody has named him.
  if (!address) return DEFAULT_ASSISTANT;

  const key = keyFor(address);
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    // Site data blocked. He is called Travis for this visit.
    return DEFAULT_ASSISTANT;
  }

  if (!names.has(key) || raws.get(key) !== raw) {
    raws.set(key, raw);
    names.set(key, raw ? cleanName(raw) : DEFAULT_ASSISTANT);
  }
  return names.get(key) ?? DEFAULT_ASSISTANT;
}

/** The server knows nothing about this browser, so it renders the default. */
function getServerSnapshot(): string {
  return DEFAULT_ASSISTANT;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  // Fires when another tab writes, so two open tabs agree.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The connected wallet's address, or null when nothing is connected. */
function useOwner(): string | null {
  const { address, isConnected } = useAccount();
  return isConnected && address ? address : null;
}

export function useAssistantName(): string {
  const owner = useOwner();
  return useSyncExternalStore(
    subscribe,
    useCallback(() => snapshotFor(owner), [owner]),
    getServerSnapshot,
  );
}

/**
 * Renaming, which requires a wallet to rename him for.
 *
 * `canRename` is false rather than the control being silently inert, so the
 * caller can say why instead of offering something that does nothing.
 */
export function useRenameAssistant(): {
  canRename: boolean;
  rename: (name: string) => void;
  reset: () => void;
} {
  const owner = useOwner();

  const write = useCallback(
    (value: string | null) => {
      if (!owner) return;
      try {
        if (value === null) localStorage.removeItem(keyFor(owner));
        else localStorage.setItem(keyFor(owner), value);
      } catch {
        // Site data blocked. The change holds for this page view.
      }
      window.dispatchEvent(new Event(CHANGED));
    },
    [owner],
  );

  return {
    canRename: owner !== null,
    // The default is stored as absence, so clearing a name and resetting are
    // the same state rather than two that can disagree.
    rename: useCallback(
      (name: string) => {
        const next = cleanName(name);
        write(next === DEFAULT_ASSISTANT ? null : next);
      },
      [write],
    ),
    reset: useCallback(() => write(null), [write]),
  };
}
