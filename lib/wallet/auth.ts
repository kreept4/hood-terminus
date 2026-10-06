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
export type SignInMethod = "email" | "twitter" | "telegram";

export type WalletAuth = {
  /** Whether the provider has finished loading. Nothing should act before this. */
  ready: boolean;
  /** Whether someone is signed in with an email or a social account. */
  authenticated: boolean;
  /**
   * Opens the sign-in modal.
   *
   * With no argument it offers everything. With a method it opens straight
   * into that one, which is what each button in the sheet does, so a tap on
   * Telegram is one step rather than a tap followed by a menu.
   */
  login: (options?: { method?: SignInMethod; email?: string }) => void;
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
