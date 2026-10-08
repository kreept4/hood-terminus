"use client";

import { createContext, useContext } from "react";

/**
 * Sign-in, described without naming who provides it.
 *
 * The context lives here rather than beside the provider so that the wallet UI
 * can read it without importing the provider's module, and with it the whole
 * Privy SDK, into every page that renders a connect button.
 */
/**
 * The ways in, named without naming the provider behind them.
 *
 * Kept as a closed union rather than a passthrough string so the sheet cannot
 * offer a method the provider was never configured for, which fails as an
 * empty modal rather than as an error.
 */
/**
 * Telegram is gone.
 *
 * It never completed a sign-in here. The widget loads, the handshake runs, and
 * it returns "Telegram auth failed or was canceled by the client", which needs
 * the bot's domain registered against `auth.privy.io` in @BotFather and a
 * working Telegram app config behind it. Three methods where one of them always
 * fails is worse than two that work, and the failures are indistinguishable
 * from the product being broken.
 */
export type SignInMethod = "email" | "twitter";

export type WalletAuth = {
  /** Whether the provider has finished loading. Nothing should act before this. */
  ready: boolean;
  /** Whether someone is signed in with an email or a social account. */
  authenticated: boolean;
  /**
   * Opens Privy's sign-in modal.
   *
   * `methods` narrows what the modal offers. It is deliberately a list rather
   * than the single method this used to take: pinning one method and prefilling
   * it was an attempt to own the whole look of signing in, and it is also the
   * shape Privy treats as a custom flow, where automatic wallet creation does
   * not run. A session with no wallet is no use here, since everything past
   * sign-in needs an address.
   */
  login: (options?: { methods?: SignInMethod[] }) => void;
  /** Ends the session. Callers should disconnect wagmi as well. */
  logout: () => Promise<void>;
  /** The address of the wallet held for this user, if there is one. */
  embeddedAddress: string | null;
  /**
   * How this person is recognisable, when they signed in as somebody rather
   * than as an address.
   *
   * An address is a fine identifier and a terrible name. Someone who signed in
   * with X has a handle and a face, and showing those instead is the difference
   * between a nav that says who you are and one that says 0xcD61...C0A8.
   */
  avatarUrl: string | null;
  handle: string | null;
};

/**
 * Null when social sign-in is not configured on this deployment, which is the
 * signal every consumer uses to hide the option rather than show it broken.
 */
export const WalletAuthContext = createContext<WalletAuth | null>(null);

export function useWalletAuth(): WalletAuth | null {
  return useContext(WalletAuthContext);
}
