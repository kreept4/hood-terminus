import { NextResponse } from "next/server";

/**
 * The mobile wallet registry, proxied from WalletConnect.
 *
 * Two things were broken without it, and they have the same cause. On a phone
 * there is no extension to announce itself over EIP-6963, so the picker had
 * nothing real to list: it fell back to monograms, which is why no logos
 * rendered. And the only remaining path, WalletConnect, drew a QR code, which
 * cannot be scanned by the phone displaying it. The result was a site that
 * only connected if you pasted its URL into a wallet's own browser.
 *
 * A wallet app is reached by handing it the pairing URI through a deep link,
 * and the link differs per wallet. That mapping is what this returns, along
 * with each wallet's real icon.
 *
 * Proxied rather than called from the browser so the response can be cached
 * once for everyone instead of per visitor, and so a registry outage degrades
 * to an empty list here rather than a failed request in the picker.
 */

const PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
const REGISTRY = "https://explorer-api.walletconnect.com/v3/wallets";

/** Cached for a day. Wallets do not change their deep links often. */
export const revalidate = 86_400;

export type MobileWallet = {
  id: string;
  name: string;
  /** The wallet's own icon, served by the registry CDN. */
  image: string;
  /** An https link that iOS will hand to the app if it is installed. */
  universal: string | null;
  /** A custom scheme, which is the only option for some wallets. */
  native: string | null;
};

type RegistryEntry = {
  id: string;
  name: string;
  image_id?: string;
  mobile?: { native?: string | null; universal?: string | null };
};

export async function GET(request: Request) {
  if (!PROJECT_ID) return NextResponse.json({ wallets: [] });

  try {
    /**
     * `platforms`, plural.
     *
     * The singular spelling is rejected with a 400 listing the valid names,
     * and because this route degrades to an empty list on any failure, that
     * looked exactly like a registry with no wallets in it: the picker changed
     * nothing and the bug survived a deploy.
     */
    /**
     * Desktop asks for the whole registry, phones ask for mobile wallets.
     *
     * The desktop picker lists wallets somebody has not installed, and it drew
     * them as monograms because it had no artwork. It does now: the same
     * registry that gives a phone its deep links gives every wallet its real
     * logo, and there was never a reason to fetch one and not the other.
     */
    const wantsAll = new URL(request.url).searchParams.get("all") === "1";
    const url =
      `${REGISTRY}?projectId=${PROJECT_ID}&entries=100&page=1` +
      (wantsAll ? "" : "&platforms=mobile");

    const res = await fetch(url, { next: { revalidate } });
    if (!res.ok) return NextResponse.json({ wallets: [] });

    const body = (await res.json()) as { listings?: Record<string, RegistryEntry> };
    const listings = Object.values(body.listings ?? {});

    const wallets: MobileWallet[] = listings
      .map((w) => ({
        id: w.id,
        name: w.name,
        image: w.image_id
          ? `https://explorer-api.walletconnect.com/v3/logo/md/${w.image_id}?projectId=${PROJECT_ID}`
          : "",
        universal: w.mobile?.universal || null,
        native: w.mobile?.native || null,
      }))
      /**
       * On a phone, a wallet with no deep link is one this picker cannot open,
       * so it is dropped. On desktop the entry is only ever a logo and a name
       * beside an install link, so a missing deep link does not disqualify it.
       */
      .filter((w) => w.image && (wantsAll || w.universal || w.native));

    return NextResponse.json({ wallets });
  } catch {
    return NextResponse.json({ wallets: [] });
  }
}
