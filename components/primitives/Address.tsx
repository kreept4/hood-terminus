"use client";

import { useState } from "react";
import { clsx } from "@/lib/clsx";
import { truncateAddress } from "@/lib/format";
import { explorerAddressUrl } from "@/lib/chain";

/**
 * Addresses appear on six screens and must behave identically on all of them:
 * truncated, click to copy, and a link out to the explorer.
 *
 * The full address is always reachable. Token identity never rests on a symbol,
 * because symbols on a permissionless chain are attacker-controlled.
 */
export function Address({
  value,
  chars = 4,
  link = true,
  className,
}: {
  value: string;
  chars?: number;
  link?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard can be unavailable in an insecure context or a locked-down
      // browser. Failing silently is correct here: the address is still shown
      // in the title attribute and the explorer link still works.
    }
  }

  return (
    <span className={clsx("inline-flex items-center gap-1.5", className)}>
      <button
        type="button" onClick={copy}
        title={copied ? "Copied" : value}
        className={clsx(
          "tnum text-small rounded-xs px-1 -mx-1",
          "transition-colors duration-100",
          copied ? "text-green" : "text-ink-2 hover:text-ink",
        )}
      >
        {copied ? "copied" : truncateAddress(value, chars)}
      </button>
      {link && (
        <a
          href={explorerAddressUrl(value)}
          target="_blank" rel="noopener noreferrer" title="Open in Blockscout" className="text-ink-3 hover:text-green transition-colors duration-100 text-micro leading-none"
        >
          ↗
        </a>
      )}
    </span>
  );
}
