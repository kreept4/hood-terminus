import type { MobileWallet } from "@/app/api/wallets/route";

export type { MobileWallet };

/**
 * Are we on a phone, where there is no extension and no scannable QR?
 *
 * User agent sniffing, which is normally the wrong tool, and is the right one
 * here: the question is not how wide the screen is but whether wallet apps and
 * their URL schemes exist on this device. A narrow desktop window has no
 * MetaMask app to open, and an iPad in landscape does.
 *
 * iPadOS reports itself as a Mac, so it is caught by the touch check instead.
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPod/i.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

/**
 * True when the page is already inside a wallet's own browser.
 *
 * There the wallet is injected, so the normal connector works and deep links
 * would bounce the user out of the app they are standing in.
 */
export function isInWalletBrowser(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as { ethereum?: unknown }).ethereum);
}

/**
 * Builds the link that hands a pairing URI to a wallet app.
 *
 * Universal links are preferred over custom schemes. A custom scheme that is
 * not installed fails silently on iOS and leaves the user on a blank screen
 * with no idea what happened; a universal link falls back to the wallet's own
 * web page, which at least explains itself.
 *
 * The URI must be encoded. It contains `?`, `&` and `=` of its own, and
 * unencoded those terminate the query string early and the wallet opens to its
 * home screen with no pairing request, which looks like the connection was
 * ignored.
 */
export function buildDeepLink(wallet: MobileWallet, uri: string): string | null {
  const encoded = encodeURIComponent(uri);

  // Both forms take the same suffix once they end in a slash. The registry
  // hands back `trust://` and `https://link.trustwallet.com`, which differ only
  // in whether that slash is already there.
  const join = (base: string) =>
    `${base.endsWith("/") ? base : `${base}/`}wc?uri=${encoded}`;

  if (wallet.universal) return join(wallet.universal);
  if (wallet.native) return join(wallet.native);
  return null;
}

/** The registry, or an empty list if it is unreachable. Never throws. */
export async function fetchMobileWallets(
  /** Desktop wants every wallet's logo, not only the ones a phone can open. */
  all = false,
): Promise<MobileWallet[]> {
  try {
    const res = await fetch(all ? "/api/wallets?all=1" : "/api/wallets");
    if (!res.ok) return [];
    const body = (await res.json()) as { wallets?: MobileWallet[] };
    return body.wallets ?? [];
  } catch {
    return [];
  }
}
