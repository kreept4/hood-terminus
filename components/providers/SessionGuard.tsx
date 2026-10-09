"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import {
  clearWagmiPersistence,
  useDisconnectAll,
  wasDisconnected,
} from "@/lib/wallet/disconnect";
import { isNewSession } from "@/lib/wallet/session";

/**
 * A connected wallet lasts for the session and no longer.
 *
 * wagmi writes its state to a cookie with no expiry, which a browser is meant
 * to drop when it closes and in practice often does not: Chrome keeps running
 * after its last window shuts, and "continue where you left off" restores
 * session cookies deliberately. So somebody came back hours later and was still
 * connected, which is not what anybody expects.
 *
 * What is actually at stake is worth being accurate about. Being connected does
 * not let this site spend anything: every transaction is signed in the wallet,
 * and the wallet's own lock is what protects the money. What it leaks is the
 * address and the portfolio behind it, to whoever opens the laptop next. That is
 * a real problem on a shared machine and the reason this exists.
 *
 * Two signals, because neither is enough on its own.
 *
 * A `sessionStorage` marker catches a new tab, since a tab starts with its own
 * empty store. It does not catch a restored one: Chrome brings `sessionStorage`
 * back with a tab reopened from history or restored at startup, so the marker
 * returns and the session looks continuous when the browser was in fact closed.
 * That was the hole, and the reason closing a tab was not enough.
 *
 * So a heartbeat in `localStorage` records that some tab was alive a moment ago.
 * A restored tab carries a marker but the heartbeat shows the gap, and a gap
 * means nothing was running, whatever the marker says.
 *
 * The costs, stated plainly. `sessionStorage` is per tab, so opening the site in
 * a second tab is a new session and disconnects the first. And closing
 * everything and coming back inside the grace window below leaves you
 * connected. Both are the price of not disconnecting somebody on every reload,
 * and they are the right way round: being asked to reconnect now and then is a
 * small annoyance, finding somebody else's wallet connected is not.
 */

const MARKER = "ht:session";
const HEARTBEAT = "ht:seen";
/** Guards the one reload that ends a session, so it can never repeat. */
const RELOADED = "ht:reset";

/**
 * How often a live tab says it is alive.
 *
 * Well inside the gap that `isNewSession` allows, which is where that
 * threshold and the reasoning behind it now live.
 */
const BEAT_MS = 10_000;

function beat() {
  try {
    localStorage.setItem(HEARTBEAT, String(Date.now()));
  } catch {
    // Site data blocked. Nothing to record, and nothing below depends on it.
  }
}

/** Milliseconds since any tab last checked in, or null when none ever has. */
function sinceLastBeat(): number | null {
  try {
    const seen = Number(localStorage.getItem(HEARTBEAT));
    if (!Number.isFinite(seen) || seen <= 0) return null;
    // A clock moved backwards reads as the future. Treat that as no answer
    // rather than as a gap, which would disconnect for no reason.
    return Math.max(0, Date.now() - seen);
  } catch {
    return null;
  }
}

export function SessionGuard() {
  const { isConnected } = useAccount();
  const disconnectAll = useDisconnectAll();

  // The session question is answered once. The disconnect flag is not: wagmi
  // reconnects after this first runs, so that check has to survive and catch it.
  const sessionDecided = useRef(false);

  // Read before the heartbeat below overwrites it, and on the first render,
  // which is the only moment the previous session's gap is still legible.
  const gapAtMount = useRef<number | null | undefined>(undefined);
  if (gapAtMount.current === undefined) gapAtMount.current = sinceLastBeat();

  // Kept running whether or not anybody is connected, because the next tab to
  // open needs to know this one was here.
  useEffect(() => {
    beat();
    const id = setInterval(beat, BEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!isConnected) return;

    /**
     * Asked to be disconnected, and reconnected anyway.
     *
     * Not once per mount: wagmi reconnects after this first runs, so the flag
     * has to be honoured every time a connection appears, until the person
     * connects deliberately.
     */
    if (wasDisconnected()) {
      end({ remember: false });
      return;
    }

    if (sessionDecided.current) return;

    let marker = false;
    try {
      marker = sessionStorage.getItem(MARKER) !== null;
      sessionStorage.setItem(MARKER, "1");
    } catch {
      // Site data blocked. Treat it as a continuing session rather than
      // disconnecting somebody on every single page view.
      sessionDecided.current = true;
      return;
    }

    sessionDecided.current = true;

    // `undefined` cannot reach here, since it is read on the first render,
    // and it would mean the same thing as `null` anyway: no answer.
    const gap = gapAtMount.current ?? null;

    if (isNewSession({ marker, gap })) end({ remember: true });

    /**
     * Ending a session, in the only order that holds.
     *
     * Disconnecting alone does not work. A wallet discovered over EIP-6963
     * cannot be given `shimDisconnect`, so wagmi reconnects it on the next
     * mount and the connection count never moves. Rabby did exactly that
     * through two previous attempts at this.
     *
     * So the persisted record goes first, because that is the part a connector
     * cannot put back: no cookie means nothing for the server to render as
     * connected and nothing for wagmi to reconnect from. The reload is what
     * makes the current page agree with that, and it is guarded so it can
     * happen at most once per tab however many times this runs.
     */
    function end({ remember }: { remember: boolean }) {
      try {
        sessionStorage.setItem(MARKER, "1");
      } catch {
        // Then the reload guard below is the only thing preventing a loop.
      }

      clearWagmiPersistence();
      void disconnectAll({ remember });

      let reloaded = false;
      try {
        reloaded = sessionStorage.getItem(RELOADED) !== null;
        sessionStorage.setItem(RELOADED, "1");
      } catch {
        // Without a guard a reload could repeat, so do not reload at all.
        return;
      }

      if (!reloaded) location.reload();
    }
  }, [isConnected, disconnectAll]);

  return null;
}
