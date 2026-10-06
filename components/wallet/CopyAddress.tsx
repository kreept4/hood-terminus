"use client";

import { useState } from "react";
import { clsx } from "@/lib/clsx";
import { truncateAddress } from "@/lib/format";

/**
 * Copy-to-clipboard button, standalone. Written instead of reusing the Address
 * primitive to avoid nesting one interactive element inside another when this
 * sits next to a Link elsewhere in the tree.
 *
 * Shows a truncated address by default. A full 42-character hex string in a
 * button is unreadable and wraps every layout it lands in.
 */
export function CopyAddress({
  address,
  chars = 6,
  className,
}: {
  address: string;
  chars?: number;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API blocked or unavailable. Silent: the address is already
      // on screen to copy by hand.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied" : `Copy ${address}`}
      className={clsx(
        "tnum rounded-sm border border-line px-2.5 py-1 text-micro transition-colors duration-100",
        copied ? "border-green-line text-green" : "text-ink-2 hover:text-ink",
        className,
      )}
    >
      {copied ? "Copied" : truncateAddress(address, chars)}
    </button>
  );
}
