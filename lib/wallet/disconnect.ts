"use client";

import { useCallback } from "react";
import { useConfig, useDisconnect } from "wagmi";

/**
 * Disconnecting, and making it stick.
 *
 * Two separate faults made Disconnect not disconnect.
 *
 * The first: wagmi holds a map of simultaneous connections, and `disconnect()`
 * with no argument ends only the active one. With several browser wallets
 * authorised, pressing Disconnect ended the first and promoted the next.
 *
 * The second, and the reason it still came back after that was fixed: wagmi
 * reconnects on mount, and `shimDisconnect` is what tells a connector not to.
 * It is set on the `injected()` fallback in `lib/wagmi.ts` and cannot be set on
 * the connectors that `multiInjectedProviderDiscovery` builds, because those are
 * created by wagmi from whatever the browser announces. Every real wallet
 * someone has installed arrives that way. So a disconnect held until the next
 * render and then undid itself, which looks like the site reconnecting a wallet
 * on its own.
 *
 * Disconnecting in a site also never revokes anything in the wallet: MetaMask
 * still lists the site as connected and will reconnect on request. The flag
 * below is this app's own record that the person asked to be disconnected, and
 * it is honoured until they connect again themselves.
 *
 * Nothing here was ever a route to spending: every transaction is signed in the
 * wallet. What it did was reattach an address the person had told us to drop.
 */

const DISCONNECTED = "ht:disconnected";

/** True when the person disconnected and has not since chosen to connect. */
export function wasDisconnected(): boolean {
  try {
    return localStorage.getItem(DISCONNECTED) === "1";
  } catch {
    // Site data blocked. Nothing persists, so nothing is suppressed.
    return false;
  }
}

/** Called when somebody picks a wallet, which is consent to be connected. */
export function clearDisconnected() {
  try {
    localStorage.removeItem(DISCONNECTED);
  } catch {
    // As above.
  }
}

function rememberDisconnected() {
  try {
    localStorage.setItem(DISCONNECTED, "1");
  } catch {
    // As above.
  }
}

export function useDisconnectAll(): (options?: { remember?: boolean }) => Promise<void> {
  const config = useConfig();
  const { disconnectAsync } = useDisconnect();

  return useCallback(
    async ({ remember = true } = {}) => {
      // Set first. A wallet that hangs on disconnect must not leave the
      // intention unrecorded, or the next mount reconnects it.
      if (remember) rememberDisconnected();

      // Snapshotted, because disconnecting mutates the map being read.
      const connections = [...config.state.connections.values()];

      for (const connection of connections) {
        try {
          await disconnectAsync({ connector: connection.connector });
        } catch {
          // One wallet refusing must not strand the rest connected, which is
          // exactly the half-disconnected state this exists to prevent.
        }
      }
    },
    [config, disconnectAsync],
  );
}

/**
 * The names wagmi persists its connection under.
 *
 * `wagmiConfig` uses `cookieStorage`, so these are cookies rather than
 * localStorage entries. They are what the server reads to render a page as
 * connected, and what wagmi reconnects from on mount.
 */
const WAGMI_KEYS = ["wagmi.store", "wagmi.recentConnectorId"];

/**
 * Removes wagmi's own record of the connection.
 *
 * Asking a connector to disconnect is not enough, and this is the lesson the
 * last two attempts at this taught. A wallet discovered over EIP-6963, which is
 * every wallet anybody actually has installed, cannot be given `shimDisconnect`
 * and will reconnect the moment wagmi asks it to on the next mount. Rabby does
 * exactly that: disconnect it and it is back before the frame is over, so the
 * connection count sits at one and nothing appears to have happened.
 *
 * Deleting the persisted record is the part a connector cannot undo. With no
 * cookie there is nothing for the server to render as connected and nothing for
 * wagmi to reconnect from, so the next load starts clean.
 */
export function clearWagmiPersistence() {
  try {
    for (const name of WAGMI_KEYS) {
      // Both forms, because a cookie set without an explicit path is scoped to
      // the directory it was set from and will not be matched by a path=/ kill.
      document.cookie = `${name}=; Max-Age=0; path=/`;
      document.cookie = `${name}=; Max-Age=0`;
    }
  } catch {
    // Site data blocked. There is then no cookie to clear.
  }
}
