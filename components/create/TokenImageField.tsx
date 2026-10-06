"use client";

import { useRef, useState } from "react";
import { clsx } from "@/lib/clsx";

/**
 * The token's picture, uploaded rather than linked.
 *
 * This was a link field, and a link field is a promise somebody else has to
 * keep. The logo lives on the creator's host, and the day that host expires,
 * rate limits us or blocks hotlinking, the artwork disappears from a token that
 * may be long graduated by then. Uploading moves the file somewhere we control,
 * once, while the form is being filled in.
 *
 * It also removes a step people were getting wrong. Nobody has a direct image
 * URL to hand; they have a picture. Asking for the URL means asking them to go
 * and host it first, which is exactly where a launch form loses somebody.
 *
 * The preview is the point of the whole control, so it is deliberately the same
 * square through every state: empty, uploading, and done. Nothing moves and
 * nothing resizes, so the picture appearing is the only change on screen.
 */

const MAX_BYTES = 2 * 1024 * 1024;

export function TokenImageField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * What the preview shows while the bytes are still in flight.
   *
   * An object URL off the chosen file, so the picture appears at the moment it
   * is picked rather than when the server answers. Revoked as soon as the real
   * one lands, because these hold the file in memory until they are.
   */
  const [local, setLocal] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);

    // Checked here as well as on the server, so an obvious mistake costs a
    // glance rather than an upload and a round trip.
    if (file.size > MAX_BYTES) {
      setError("That image is over 2MB. Try a smaller one.");
      return;
    }

    const preview = URL.createObjectURL(file);
    setLocal(preview);
    setBusy(true);

    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/token-image", { method: "POST", body });
      const data = (await res.json()) as { url?: string; error?: string };

      if (!res.ok || !data.url) {
        setError(data.error ?? "The upload did not save. Try again.");
        onChange(null);
        return;
      }
      onChange(data.url);
    } catch {
      setError("The upload did not save. Try again.");
      onChange(null);
    } finally {
      setBusy(false);
      URL.revokeObjectURL(preview);
      setLocal(null);
    }
  }

  function clear() {
    onChange(null);
    setError(null);
    // Without this, choosing the same file again fires no change event.
    if (input.current) input.current.value = "";
  }

  const shown = local ?? value;

  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-body font-medium text-ink">Image</span>
        <span className="text-micro text-ink-3">Optional</span>
      </span>

      <div className="flex items-start gap-3">
        <Preview url={shown} busy={busy} />

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            ref={input}
            id="token-image"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={busy}
              className={clsx(
                "rounded-md border border-line px-3 py-2 text-body text-ink",
                "transition-colors duration-100 hover:border-green hover:text-green",
                "disabled:opacity-50",
              )}
            >
              {busy ? "Uploading" : value ? "Replace" : "Choose image"}
            </button>

            {value && !busy && (
              <button
                type="button"
                onClick={clear}
                className="rounded-md px-2 py-2 text-micro text-ink-3 transition-colors duration-100 hover:text-red"
              >
                Remove
              </button>
            )}
          </div>

          {error && <span className="text-micro text-red">{error}</span>}
        </div>
      </div>
    </div>
  );
}

function Preview({ url, busy }: { url: string | null; busy: boolean }) {
  const [broken, setBroken] = useState(false);

  if (!url) {
    return (
      <span
        aria-hidden="true"
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-line bg-surface-2 text-micro text-ink-3"
      >
        None
      </span>
    );
  }

  return (
    <span className="relative h-16 w-16 shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        // Keyed on the url so a new picture clears the previous failure.
        key={url}
        src={url}
        alt=""
        width={64}
        height={64}
        onError={() => setBroken(true)}
        className="h-16 w-16 rounded-md border border-line-soft bg-surface-2 object-cover"
        style={broken ? { visibility: "hidden" } : undefined}
      />
      {busy && (
        <span className="absolute inset-0 flex items-center justify-center rounded-md bg-ground/60 text-micro text-ink">
          …
        </span>
      )}
    </span>
  );
}
