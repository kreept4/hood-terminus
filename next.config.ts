import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * A wallet app is a phishing target by construction: the whole product is a
 * page that asks people to sign things. The headers below are the cheap half of
 * defending that, and the app shipped with none of them.
 *
 * The CSP is deliberately not maximal. `script-src` allows `unsafe-inline` and
 * `unsafe-eval` because wallet extensions inject scripts into the page and
 * several of them use `eval` internally; a strict script policy breaks wallet
 * connection outright, which trades a real feature for a theoretical gain. The
 * directives that cost nothing and stop real attacks are strict:
 *
 *   frame-ancestors 'none'   no clickjacking. This is the one that matters most
 *                            for a signing surface: an attacker framing the app
 *                            and overlaying their own UI is how signature
 *                            phishing actually works.
 *   object-src 'none'        no Flash-era plugin surface.
 *   base-uri 'self'          stops an injected <base> retargeting every
 *                            relative URL on the page.
 *   form-action 'self'       nothing can post the page's forms elsewhere.
 *
 * `connect-src` is an allowlist, which is the other directive doing real work
 * here: it means injected code cannot exfiltrate to an arbitrary host.
 */

const CONNECT_SRC = [
  "'self'",
  // Market data.
  "https://api.geckoterminal.com",
  // The chain, public endpoint and Alchemy.
  "https://rpc.mainnet.chain.robinhood.com",
  "https://rpc.testnet.chain.robinhood.com",
  "https://*.g.alchemy.com",
  "wss://*.g.alchemy.com",
  // Supabase, REST and realtime.
  "https://*.supabase.co",
  "wss://*.supabase.co",
  // WalletConnect: relay, and the registry its picker reads.
  "https://*.walletconnect.com",
  "https://*.walletconnect.org",
  "https://*.reown.com",
  "wss://*.walletconnect.com",
  "wss://*.walletconnect.org",
  // Coinbase Wallet SDK.
  "https://*.coinbase.com",
  // Supabase storage, which is where uploaded token artwork now lives. Already
  // covered by the Supabase wildcard above, listed here so it is not removed
  // by accident later.
].join(" ");

const CSP = [
  "default-src 'self'",
  // Relaxed on purpose, for wallet extensions: they inject their provider
  // into the page, and a strict policy here blocks the wallets this product
  // now depends on entirely.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // data: for wallet icons, https: for token artwork from CoinGecko.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${CONNECT_SRC}`,
  /**
   * WalletConnect frames its own surfaces. A blocked frame fails the same
   * silent way a blocked fetch does, which is why this is listed rather than
   * left to `default-src`.
   */
  [
    "frame-src 'self'",
    "https://*.walletconnect.com",
    "https://*.walletconnect.org",
  ].join(" "),
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  /**
   * Where a form on this page may post.
   *
   * Nothing but this origin. The identity hosts that used to be listed here
   * were for Privy's OAuth, which posted the sign-in form to the provider.
   */
  [
    "form-action 'self'",
  ].join(" "),
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          // Belt and braces with frame-ancestors, for anything that only
          // understands the older header.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            // Nothing here needs any of these. A page that cannot ask for the
            // camera cannot be tricked into asking for the camera.
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
      {
        /**
         * The API is same-origin by default, with one stated exception.
         *
         * Sending no CORS headers is what keeps a cross-origin page from
         * reading these, which matters for the expensive ones. `/api/verify/*`
         * opts out and sets its own, because Verify is the piece of this
         * product worth other people building on and a check nobody else can
         * call is a check nobody else can use. That route is public chain data
         * with no session behind it, so there is nothing for a hostile page to
         * ride, and it carries its own rate limit.
         *
         * `Cache-Control: no-store` here is a default, not a ceiling: a route
         * that sets its own in the response wins, which is how Verify keeps its
         * sixty-second edge cache.
         */
        source: "/api/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
