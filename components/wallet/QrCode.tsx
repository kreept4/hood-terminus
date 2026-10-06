"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * A QR code, drawn here rather than pulled from an image service.
 *
 * Two callers want one: a WalletConnect pairing, and a deposit address. Both
 * need the same thing, so the drawing lives once.
 *
 * Drawn to an SVG string rather than a canvas: it stays sharp at any density
 * and there is no pixel buffer to size.
 */
export function QrCode({
  value,
  size = 232,
  /** Shown while there is nothing to draw yet. */
  pendingLabel,
  onFail,
}: {
  value: string | null;
  size?: number;
  pendingLabel?: string;
  onFail?: () => void;
}) {
  /**
   * Held together with the value it was drawn from, rather than on its own.
   *
   * Drawing is asynchronous, so a bare `svg` would still be the old code for a
   * frame or two after `value` changes: a pairing QR that has already expired,
   * or worse, the previous account's deposit address under the new one's
   * heading. Comparing the two during render means a stale code is never shown,
   * and it takes the clearing out of the effect, where synchronous setState
   * costs a cascading render.
   */
  const [drawn, setDrawn] = useState<{ value: string; svg: string } | null>(
    null,
  );

  useEffect(() => {
    if (!value) return;
    let live = true;

    QRCode.toString(value, {
      type: "svg",
      margin: 1,
      // High correction, because a phone camera reading a screen at an angle
      // in bad light is the normal case rather than the exception.
      errorCorrectionLevel: "H",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((out) => live && setDrawn({ value, svg: out }))
      .catch(() => live && onFail?.());

    return () => {
      live = false;
    };
    // `onFail` is deliberately out: callers pass an inline arrow, and including
    // it would redraw the code on every render of the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const svg = drawn && drawn.value === value ? drawn.svg : null;

  if (!value || !svg) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div
          className="animate-pulse rounded-md bg-surface-2"
          style={{ width: size, height: size }}
        />
        {pendingLabel && (
          <p className="text-micro text-ink-3">{pendingLabel}</p>
        )}
      </div>
    );
  }

  return (
    // White plate behind the code. A QR on a near-black ground fails to scan on
    // most phones, so this is one of the few places the dark theme has to give
    // way to physics.
    <div
      className="rounded-lg bg-white p-3"
      dangerouslySetInnerHTML={{ __html: svg }}
      style={{ width: size, height: size }}
    />
  );
}
