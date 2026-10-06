"use client";

import { useState } from "react";
import { QrCode } from "@/components/wallet/QrCode";

/**
 * The WalletConnect QR, rendered here rather than in WalletConnect's own modal.
 *
 * Two reasons. Their bundled modal is a separate package with its own styling
 * that lands on top of ours looking like a different product, and more
 * practically it is being retired in favour of AppKit, so depending on it is
 * depending on something on its way out.
 *
 * The connector emits the pairing URI as `display_uri`. That is all a QR needs,
 * so this takes it and hands it to `QrCode`.
 */
export function QrPanel({ uri }: { uri: string | null }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <p className="py-6 text-center text-body text-ink-3">
        Could not draw the code. Copy the link below instead.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <QrCode
        value={uri}
        pendingLabel="Opening a session"
        onFail={() => setFailed(true)}
      />

      {uri && (
        <>
          <p className="max-w-[16rem] text-center text-micro text-ink-3">
            Open your wallet app and scan this. It stays valid until you close
            this window.
          </p>
          <CopyLink uri={uri} />
        </>
      )}
    </div>
  );
}

/** For a wallet on the same device, where there is nothing to point a camera at. */
function CopyLink({ uri }: { uri: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(uri);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard blocked. Nothing useful to fall back to here.
        }
      }}
      className="rounded-md border border-line px-3 py-1.5 text-micro text-ink-2 transition-colors duration-100 hover:border-green hover:text-green"
    >
      {copied ? "Copied" : "Copy link instead"}
    </button>
  );
}
