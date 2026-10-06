"use client";

import { useEffect, useState } from "react";
import { clsx } from "@/lib/clsx";
import { BRAND } from "@/lib/brand";

/**
 * "Add to home screen", on a phone.
 *
 * Two different mechanisms behind one prompt, because the platforms disagree:
 *
 *   Chrome and Edge fire `beforeinstallprompt`, which can be held onto and
 *   replayed later. That gives a real button that installs on tap.
 *
 *   iOS Safari fires nothing and exposes no API at all. The only route is
 *   Share, then Add to Home Screen, so there the prompt is instructions rather
 *   than a button. Showing a dead "Install" button on iOS would be worse than
 *   showing nothing.
 *
 * It waits before appearing. A banner that interrupts the first screen is an
 * ad; one that appears after someone has stayed a while is an offer.
 */

const KEY = "ht:install-dismissed";
const DELAY_MS = 20_000;

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Already installed: `standalone` on iOS, the display-mode query elsewhere.
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (installed) return;

    try {
      if (localStorage.getItem(KEY) === "1") return;
    } catch {
      // Site data blocked. It will be offered again next visit, which is the
      // acceptable failure.
    }

    const ua = window.navigator.userAgent;
    const isIosSafari =
      /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    setIos(isIosSafari);

    function onBeforeInstall(e: Event) {
      // Held rather than dispatched now, so the browser's own banner is
      // suppressed and the offer appears on our terms.
      e.preventDefault();
      setEvent(e as InstallEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const timer = setTimeout(() => setShow(true), DELAY_MS);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // As above.
    }
  }

  async function install() {
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    setEvent(null);
    dismiss();
  }

  // Nothing to offer unless the browser gave us a prompt to replay, or this is
  // iOS Safari where the instructions are the offer.
  if (!show || (!event && !ios)) return null;

  return (
    <div
      role="dialog"
      aria-label={`Add ${BRAND.name} to your home screen`}
      className={clsx(
        "fixed inset-x-3 bottom-[5.5rem] z-50 md:hidden",
        "rounded-lg border border-line bg-surface p-4",
        "shadow-[0_18px_40px_-16px_var(--shadow-2)]",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M7 3 H21 V17 H17 V21 H3 V7 H7 Z
                 M8.5 8.5 H15.5 V15.5 H8.5 Z
                 M10.4 11.1 H13.6 V12.9 H10.4 Z"
              className="fill-green"
            />
          </svg>
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-ink">
            Keep {BRAND.name} on your home screen
          </p>
          <p className="mt-1 text-micro text-ink-2">
            {ios
              ? "Tap Share, then Add to Home Screen."
              : "Opens full screen, straight to the markets."}
          </p>
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-mt-1 -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors duration-100 hover:bg-surface-2 hover:text-ink"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
            <path
              d="M2.5 2.5l9 9M11.5 2.5l-9 9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {event && (
        <button
          type="button"
          onClick={install}
          className="mt-3 w-full rounded-md bg-green py-2.5 text-body font-semibold text-on-accent transition-opacity duration-100 hover:opacity-90"
        >
          Add to home screen
        </button>
      )}
    </div>
  );
}
