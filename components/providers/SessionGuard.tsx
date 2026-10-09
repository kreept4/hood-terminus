"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { useDisconnectAll, wasDisconnected } from "@/lib/wallet/disconnect";

/**
 * A connected wallet lasts for the session and no longer.
 *
 * wagmi already writes its state to a cookie with no expiry, which a browser is
 * meant to drop when it closes. In practice it often does not: Chrome keeps
 * running after its last window is shut, and "continue where you left off"
 * restores session cookies on purpose. So somebody comes back to the site hours
 * later and is still connected, which is not what anybody expects.
 *
 * What is actually at stake is worth being accurate about. Being connected does
 * not let this site spend anything: every transaction is signed in the wallet,
 * and the wallet's own lock is what protects the money. What it does leak is the
 * address and the portfolio behind it, to whoever opens the laptop next. That is
 * a real problem on a shared machine and the reason this exists.
 *
 * `sessionStorage` is the one browser store with exactly the lifetime wanted: it
 * survives a reload and same-tab navigation, and is dropped when the tab closes,
 * whatever the browser does with cookies. So the rule is: if wagmi thinks we are
 * connected but this tab has no marker, the connection came from a previous
 * session and is ended.
 *
 * The cost, stated plainly: `sessionStorage` is per tab, so opening the site in
 * a second tab is a new session and disconnects the first. That is the price of
 * the guarantee, and it is the right way round. Being asked to reconnect once in
 * a while is a small annoyance; finding somebody else's wallet already connected
 * is not.
 */

const MARKER = "ht:session";

export function SessionGuard() {
  const { isConnected } = useAccount();
  const disconnectAll = useDisconnectAll();

  // The session question is answered once. The disconnect flag is not: wagmi
  // reconnects after this first runs, so that check has to survive and catch it.
  const sessionDecided = useRef(false);

  useEffect(() => {
    if (!isConnected) return;

    /**
     * Asked to be disconnected, and reconnected anyway.
     *
     * This is not once per mount. wagmi reconnects on mount, often after this
     * effect has already run, so the flag has to be honoured every time a
     * connection appears until the person connects deliberately.
     *
     * `remember: false` because this is us enforcing their earlier decision,
     * not a new one, and rewriting the flag would be noise.
     */
    if (wasDisconnected()) {
      void disconnectAll({ remember: false });
      return;
    }

    if (sessionDecided.current) return;

    let fresh = false;
    try {
      fresh = sessionStorage.getItem(MARKER) === null;
      sessionStorage.setItem(MARKER, "1");
    } catch {
      // Site data blocked. Treat it as a continuing session rather than
      // disconnecting somebody on every single page view.
      sessionDecided.current = true;
      return;
    }

    sessionDecided.current = true;
    // A new tab inherits no session, so a connection carried in by a cookie
    // belongs to a previous one. Remembered, so the reconnect does not undo it.
    if (fresh) void disconnectAll();
  }, [isConnected, disconnectAll]);

  return null;
}
