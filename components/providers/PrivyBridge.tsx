"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { http, createStorage, cookieStorage } from "wagmi";
import { WagmiProvider as BareWagmiProvider } from "wagmi";
import {
  usePrivy,
  useWallets,
  useCreateWallet,
  getEmbeddedConnectedWallet,
} from "@privy-io/react-auth";
import {
  createConfig as createPrivyConfig,
  WagmiProvider as PrivyWagmiProvider,
} from "@privy-io/wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import { robinhoodChain } from "@/lib/chain";
import { WalletAuthContext, type WalletAuth } from "@/lib/wallet/auth";

/**
 * The seam between Privy's sign-in and the wallet stack the rest of the app
 * already reads.
 *
 * Worth reading before changing anything here, because the obvious wiring is
 * wrong in a way that does not show up until a phone is in your hand.
 *
 * `@privy-io/wagmi`'s provider does not add to wagmi's connector list, it
 * replaces it. Its sync effect calls `config._internal.connectors.setState`
 * with connectors built from Privy's own wallets and nothing else, so when
 * nobody is signed in that list is empty. Wrapping the whole app in it would
 * therefore empty the connect sheet: no MetaMask, no discovered wallets, no
 * WalletConnect, no deep links. Everything that already works on a phone would
 * go blank, and only for people who have a wallet, which is the half of the
 * audience that currently converts.
 *
 * So the two paths are kept apart rather than stacked:
 *
 *   - No embedded wallet, which is every visitor until they sign in with an
 *     email or a social account: plain wagmi, the full connector list, the
 *     existing sheet unchanged.
 *   - An embedded wallet exists: Privy's provider, which is allowed to own the
 *     connector list because in that state its wallet is the only one there is.
 *
 * They also hold separate configs. `setState` above mutates the config object
 * itself, so letting Privy write into the shared singleton would leave the
 * plain path with an emptied connector list after a sign-out, with nothing to
 * put it back. Privy gets its own config to scribble on.
 *
 * Signing in remounts the wagmi tree. That is a real cost and it is the right
 * one: it happens once, at the moment a user goes from having no wallet to
 * having one, and the query cache sits above this and survives it.
 */

/**
 * Privy's own config helper, not wagmi's.
 *
 * It strips connectors and turns off EIP-6963 discovery on purpose, because on
 * this path the embedded wallet is the only wallet. Its storage key is its own
 * so a connector id left behind by one path cannot be read back by the other.
 *
 * The cast is the price of that. `lib/wagmi` registers its own config with
 * wagmi's `Register` interface, which types the connector list as a non-empty
 * tuple, and this config starts with none. The runtime shape is the same chain,
 * the same transport and the same store; only that tuple differs, and Privy
 * overwrites the connectors here anyway.
 */
const privyWagmiConfig = createPrivyConfig({
  chains: [robinhoodChain],
  transports: { [robinhoodChain.id]: http() },
  storage: createStorage({ storage: cookieStorage, key: "wagmi.privy" }),
  ssr: true,
}) as unknown as typeof wagmiConfig;

export function PrivyBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();

  const embedded = getEmbeddedConnectedWallet(wallets);

  /**
   * Make the wallet if signing in did not.
   *
   * `createOnLogin: "all-users"` is set, and on this app it does not produce
   * one: people complete a sign-in and arrive with an identity and no address,
   * which is useless here because every action past sign-in needs one.
   *
   * This is not the earlier version of this code coming back. That one ran
   * inside the login flow and blocked it, so a sign-in that could not create a
   * wallet sat on "creating wallet" forever and nobody got in. This runs after
   * the fact, on a session that is already complete, and the whole app renders
   * correctly without it: if the promise never settles, the only consequence is
   * that there is still no wallet, which is exactly where we were anyway.
   *
   * Once per mount, guarded by a ref rather than state so a failure cannot loop
   * and so this never re-renders anything.
   */
  const createAttempted = useRef(false);
  const { createWallet } = useCreateWallet();

  useEffect(() => {
    if (!ready || !authenticated || embedded) return;
    if (createAttempted.current) return;
    createAttempted.current = true;

    void createWallet().catch((e: unknown) => {
      // Loud on purpose. A silent failure here is indistinguishable from the
      // product being broken, which is how this cost days once already.
      console.error(
        "[privy] Signed in, but creating an embedded wallet failed. " +
          "Linking an external wallet still works.",
        e,
      );
    });
  }, [ready, authenticated, embedded, createWallet]);

  /**
   * Wallet creation is Privy's job, not ours.
   *
   * This called `createWallet()` for any signed-in user without one, to work
   * around the dashboard's `create_on_login` being off. It has to go, because
   * it was standing between people and a completed login: X authenticates
   * fine, and then the sign-in sat on "creating wallet" indefinitely, because
   * this app's wallet mode is `user-controlled-server-wallets-only` and the
   * creation it triggers wants a passcode flow that never appears.
   *
   * Removing it means signing in completes. Someone who signs in while the
   * dashboard setting is off simply arrives without a wallet, which is a
   * visible, explainable state rather than a spinner that never resolves.
   * Turning the setting on gives them one, which is the supported path and
   * always was.
   */

  const auth = useMemo<WalletAuth>(
    () => ({
      ready,
      authenticated,
      /**
       * Wrapped rather than passed through, for two reasons. Privy's `login`
       * also accepts a mouse event, so handing it straight to an onClick would
       * pass the event as options and open a modal configured by accident. And
       * this is where our own vocabulary is translated into theirs, which is
       * what keeps the sheet from importing Privy at all.
       */
      /**
       * Narrows the modal's methods, and nothing else.
       *
       * The prefill went with the per-method buttons. Handing Privy an address
       * to start from was the last piece of the custom flow, and the whole
       * point of going back to its modal is that the modal is the path where a
       * wallet actually gets created.
       */
      login: (options) =>
        login(options?.methods ? { loginMethods: options.methods } : {}),
      logout,
      embeddedAddress: embedded?.address ?? null,
      /**
       * `_normal` is Twitter's 48px thumbnail. Stripping it returns the
       * original, which stays sharp on a retina screen at the size we draw it.
       */
      avatarUrl:
        user?.twitter?.profilePictureUrl?.replace("_normal", "") ?? null,
      handle: user?.twitter?.username ?? null,
    }),
    [
      ready,
      authenticated,
      login,
      logout,
      embedded?.address,
      user?.twitter?.profilePictureUrl,
      user?.twitter?.username,
    ],
  );

  return (
    <WalletAuthContext.Provider value={auth}>
      {embedded ? (
        <PrivyWagmiProvider config={privyWagmiConfig}>
          {children}
        </PrivyWagmiProvider>
      ) : (
        <BareWagmiProvider config={wagmiConfig}>{children}</BareWagmiProvider>
      )}
    </WalletAuthContext.Provider>
  );
}
