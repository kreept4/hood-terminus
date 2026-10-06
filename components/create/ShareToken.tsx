"use client";

import { useState } from "react";

/**
 * The share control on a curve token.
 *
 * A token nobody can see outside this site is bought only by people the
 * creator brings, so posting the link is not a nice extra, it is the entire
 * distribution. Making someone select a URL out of the address bar on a phone
 * is enough friction to lose that.
 *
 * Uses the native share sheet where there is one, which on a phone is what
 * puts the link into X or Telegram in one tap, and falls back to the clipboard
 * everywhere else.
 */
export function ShareToken({
  symbol,
  percent,
}: {
  symbol: string;
  percent: number;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    const text = `${symbol} is ${percent}% of the way to opening a market on Hood Terminus.`;

    if (navigator.share) {
      try {
        await navigator.share({ title: symbol, text, url });
        return;
      } catch {
        // Dismissed, or unavailable despite existing. Fall through to copying.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denied. Nothing useful left to try.
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="shrink-0 rounded-md border border-line px-4 py-2 text-body text-ink transition-colors duration-100 hover:border-green hover:text-green"
    >
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
