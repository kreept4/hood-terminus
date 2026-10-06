"use client";

import { useState, type ReactNode } from "react";
import { WagmiProvider as BareWagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "@privy-io/react-auth";
import { PrivyBridge } from "@/components/providers/PrivyBridge";
import { wagmiConfig } from "@/lib/wagmi";
import { robinhoodChain } from "@/lib/chain";

/**
 * Wallets, with a way in for people who do not have one.
 *
 * The funnel here is a stranger tapping a link someone posted. Asking them to
 * install a browser extension first is where most of them leave, and a token on
 * the curve cannot be bought anywhere else, so that exit is the end of it.
 *
 * Privy answers that by issuing an embedded wallet on sign-in: an ordinary EVM
 * address on this chain, created from an email or an X account, that the rest
 * of the app cannot tell apart from MetaMask.
 *
 * It is deliberately the path for people with no wallet and only that. Anyone
 * who already has one keeps the existing sheet, with its discovered wallets,
 * its deep links and its QR code. That split is not a preference, it is what
 * keeps both working at once, and the reasoning is in `PrivyBridge`.
 *
 * Without an app id the whole Privy layer is skipped and the app runs exactly
 * as it did before, on wagmi alone. A missing environment variable should cost
 * the new path, not the working one.
 */

/**
 * The Privy app id, cleaned and checked before anything is built on it.
 *
 * `PrivyProvider` throws on an id it does not recognise, and it is rendered
 * during static prerendering, so that throw is not a broken sign-in button on
 * one page. It is a failed production build: the whole site stops shipping
 * because one environment variable has something invisible in it.
 *
 * That is not hypothetical. Setting this through a PowerShell pipe stored the
 * id with a byte order mark in front of it, which is a character you cannot see
 * in a dashboard, in a diff, or in a log line, and the only symptom was
 * "Cannot initialize the Privy provider with an invalid Privy app ID" during
 * prerender of an unrelated page.
 *
 * So the value is stripped of a BOM, surrounding quotes and stray whitespace,
 * then checked against the shape these ids actually have. Anything that fails
 * is treated as absent, which falls through to the wallet-only path below. A
 * misconfigured variable should cost the feature it configures, never the
 * deploy.
 */
function readPrivyAppId(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!raw) return undefined;

  const cleaned = raw
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^['"]|['"]$/g, "");

  if (!/^[a-z0-9]{20,32}$/i.test(cleaned)) {
    // Loud, because the alternative is a sign-in button that is silently
    // absent in production and present everywhere it was tested.
    console.warn(
      "[privy] NEXT_PUBLIC_PRIVY_APP_ID is set but is not a valid app id. " +
        "Social sign-in is disabled; wallets still work.",
    );
    return undefined;
  }

  return cleaned;
}

const PRIVY_APP_ID = readPrivyAppId();

export function Web3Providers({ children }: { children: ReactNode }) {
  // Created in state rather than at module scope so each SSR request gets its
  // own. A shared client leaks cached data between users on the server.
  const [queryClient] = useState(() => new QueryClient());

  if (!PRIVY_APP_ID) {
    return (
      <BareWagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </BareWagmiProvider>
    );
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        /**
         * `loginMethods` is deliberately not set here.
         *
         * Naming them in code meant asking Privy for methods the dashboard had
         * not enabled, and Privy answers that by refusing to open the modal at
         * all. The symptom is brutal to debug: every button dies, including the
         * ones that are configured correctly, and nothing is logged. One
         * disabled toggle took down email and Telegram too.
         *
         * Omitting it makes the dashboard the only place login methods are
         * decided, so the two can never disagree again. Turning a method on or
         * off there is now a complete change with no deploy attached to it.
         */

        embeddedWallets: {
          ethereum: {
            // Everyone arriving down this path is by definition someone with
            // no wallet, so there is nobody here to spare.
            createOnLogin: "all-users",
          },
        },

        // One chain, the same one wagmi is configured for. Passing others would
        // create a state where the wallet is on a network this app cannot use.
        defaultChain: robinhoodChain,
        supportedChains: [robinhoodChain],

        appearance: {
          theme: "dark",
          accentColor: "#CCFF00",
          // `/icon`, not `/icon.png`. The mark is generated by
          // `app/icon.tsx`; the .png path 404s.
          logo: "/icon",
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <PrivyBridge>{children}</PrivyBridge>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
