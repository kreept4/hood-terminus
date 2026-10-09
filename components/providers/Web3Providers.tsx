"use client";

import { useState, type ReactNode } from "react";
import { WagmiProvider, type State } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";

/**
 * Wallets.
 *
 * One path in: a wallet the visitor already has. Every connector wagmi reports
 * over EIP-6963, plus WalletConnect for anyone on a phone.
 *
 * There used to be a second path. Privy issued an embedded wallet from an email
 * or an X account, for the stranger tapping a posted link with nothing
 * installed, and on paper that is the right answer for the top of the funnel.
 * In practice it never produced a wallet on this app. Sign-in completed, the
 * session was real, and no address was ever attached, so people arrived
 * authenticated and unable to do the one thing they came for. The faults wore
 * the same symptom, a dead button, and cost days: an origin the dev server kept
 * drifting off, a sheet that offered sign-in to somebody already signed in, a
 * Telegram widget that never completed, and finally wallet creation that the
 * app's server-wallet configuration would not perform.
 *
 * So it is gone rather than left in, broken, next to something that works. The
 * cost is real and worth stating: a visitor with no wallet now has to go and
 * get one, and some of them will not come back. That is a worse funnel and a
 * working product, which beats a better funnel and a dead end.
 */
export function Web3Providers({
  children,
  initialState,
}: {
  children: ReactNode;
  /**
   * The connection, read from the cookie on the server.
   *
   * `wagmiConfig` sets `ssr: true` with `cookieStorage`, which only works if
   * the server hands the state it read to the provider. Without it every
   * navigation started from nothing and reconnected asynchronously, so a
   * connected wallet rendered as disconnected for the first paint of every
   * page: the nav offered "Connect a wallet" to somebody already connected,
   * and the portfolio asked them to connect one.
   */
  initialState: State | undefined;
}) {
  // Created in state rather than at module scope so each SSR request gets its
  // own. A shared client leaks cached data between users on the server.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
