"use client";

import { useCallback } from "react";
import { useConfig, useDisconnect } from "wagmi";

/**
 * Disconnect every wallet, not just the one on screen.
 *
 * wagmi holds a map of simultaneous connections, and `disconnect()` with no
 * argument ends only the active one. With several browser wallets installed,
 * more than one can be authorised at once and reconnect together on load, so
 * pressing Disconnect ended the first and promoted the next. From the outside
 * that reads as the site reconnecting a wallet by itself, which is the single
 * most alarming thing a product that touches money can appear to do.
 *
 * It is not a leak and nothing was spent: every one of those connections was
 * authorised by the person at some point, and connecting grants no power to
 * move funds. It is still wrong. Disconnect has to mean all of them, because
 * nobody reads it as "disconnect one of the several you forgot about".
 *
 * Shared between the account menu and the session guard so the two cannot
 * disagree about what disconnecting means.
 */
export function useDisconnectAll(): () => Promise<void> {
  const config = useConfig();
  const { disconnectAsync } = useDisconnect();

  return useCallback(async () => {
    // Snapshotted first: disconnecting mutates the map being read.
    const connections = [...config.state.connections.values()];

    for (const connection of connections) {
      try {
        await disconnectAsync({ connector: connection.connector });
      } catch {
        // One wallet refusing must not strand the rest connected, which would
        // leave exactly the half-disconnected state this exists to prevent.
      }
    }
  }, [config, disconnectAsync]);
}
