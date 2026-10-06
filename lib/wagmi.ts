import { http, createConfig, createStorage, cookieStorage } from "wagmi";
import { injected, walletConnect, coinbaseWallet } from "wagmi/connectors";
import { robinhoodChain } from "@/lib/chain";
import { BRAND } from "@/lib/brand";

/**
 * wagmi config, scoped to Robinhood Chain only.
 *
 * One chain is passed deliberately: this product only trades on chain 4663, so
 * there is nothing to gain from listing others, and a chain switcher would be a
 * UI surface for a state that cannot legitimately occur here.
 *
 * Wallet coverage comes from three layers rather than a hardcoded list:
 *
 *   1. EIP-6963 discovery, which is `multiInjectedProviderDiscovery` below.
 *      Every browser wallet that announces itself appears on its own, with its
 *      real name and icon: MetaMask, Rabby, Phantom, Trust, OKX, Brave, Zerion
 *      and anything else installed. Nothing needs adding here when a new one
 *      ships.
 *   2. Coinbase Wallet, which needs its own SDK for the smart-wallet path.
 *   3. WalletConnect, which is what reaches the hundreds of mobile wallets that
 *      have no browser extension at all.
 *
 * WalletConnect needs a project ID from https://cloud.reown.com, which is free.
 * Without it that third layer is absent and the picker shows only what is
 * installed locally, which on a phone is usually nothing.
 */
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

if (!walletConnectProjectId && process.env.NODE_ENV !== "production") {
  // Non-fatal: MetaMask, Coinbase, and injected still work without it.
  console.warn(
    "[wagmi] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set. Browser wallets " +
      "still work; mobile wallets without an extension will not appear.",
  );
}

export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  // Every wallet that announces itself over EIP-6963 becomes its own connector,
  // named and iconed by the wallet rather than by us.
  multiInjectedProviderDiscovery: true,
  connectors: [
    // The fallback for wallets old enough to only write `window.ethereum` and
    // never announce themselves. `shimDisconnect` so disconnecting sticks
    // rather than silently reconnecting on the next page load.
    injected({ shimDisconnect: true }),
    coinbaseWallet({
      appName: BRAND.name,
      // Coinbase's own dark/light-adaptive icon; swap for /logo.png once
      // there's a hosted asset, since Coinbase requires a public URL, not
      // an inline SVG.
      preference: { options: "all" },
    }),
    ...(walletConnectProjectId
      ? [
          walletConnect({
            projectId: walletConnectProjectId,
            metadata: {
              name: BRAND.name,
              description: BRAND.description,
              url:
                typeof window !== "undefined"
                  ? window.location.origin
                  : "https://hood-terminus.vercel.app",
              // Served by `app/icon.tsx` at `/icon`. There is no `/icon.png`,
              // and the 404 showed as a broken mark in the approval
              // prompt of every mobile wallet.
              icons: ["https://hood-terminus.vercel.app/icon"],
            },
            // False on purpose. Their modal is a second design system landing
            // on top of ours, and it is being retired in favour of AppKit.
            // The connector still emits `display_uri`, which is all a QR needs,
            // and QrPanel draws it in our own sheet.
            showQrModal: false,
          }),
        ]
      : []),
  ],
  transports: {
    [robinhoodChain.id]: http(),
  },
  // Persists the connected-wallet flag across reloads via cookies, so SSR
  // and the client agree on connection state on first paint instead of
  // flashing "disconnected" for a frame.
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
