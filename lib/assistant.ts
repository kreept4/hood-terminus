"use client";

import { useSyncExternalStore } from "react";

/**
 * The assistant's name.
 *
 * The check has a name because a name is repeatable. "Run it through the
 * pre-trade sell simulator" is an instruction about software; "ask Travis" is a
 * habit, and a habit is the thing worth building.
 *
 * It is a default rather than a brand, and people can change it. Somebody who
 * renames him has decided he is theirs, which is the whole point of giving him
 * a name in the first place.
 *
 * Stored per browser, like every other preference here, and never sent to us.
 */

export const DEFAULT_ASSISTANT = "Travis";

const KEY = "ht:assistant";
const CHANGED = "ht:assistant-changed";

/** 24 is long enough for any name and short enough to fit the header. */
const MAX = 24;

export function cleanName(input: string): string {
  // Collapse whitespace so a name cannot be padded into breaking a layout, and
  // fall back rather than ever rendering an empty label.
  const trimmed = input.replace(/\s+/g, " ").trim().slice(0, MAX);
  return trimmed || DEFAULT_ASSISTANT;
}

function read(): string {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? cleanName(raw) : DEFAULT_ASSISTANT;
  } catch {
    // Site data blocked. He is called Travis for this visit.
    return DEFAULT_ASSISTANT;
  }
}

export function setAssistantName(name: string) {
  const next = cleanName(name);
  try {
    if (next === DEFAULT_ASSISTANT) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // As above. The change holds for this page view.
  }
  window.dispatchEvent(new Event(CHANGED));
}

/**
 * Cached, because `useSyncExternalStore` compares snapshots by identity and a
 * fresh string every call would re-render forever.
 */
let cached: string | null = null;
let cachedRaw: string | null = null;

function getSnapshot(): string {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw || cached === null) {
    cachedRaw = raw;
    cached = read();
  }
  return cached;
}

/** The server knows nothing about this browser, so it renders the default. */
function getServerSnapshot(): string {
  return DEFAULT_ASSISTANT;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useAssistantName(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
