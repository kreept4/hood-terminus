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
  /**
   * Privy. Its SDK fetches app config from `auth.privy.io` the moment it
   * initialises, and without this the fetch is refused, `ready` never turns
   * true, and every sign-in button silently does nothing. There is no error on
   * screen and nothing Privy can log, because the request never leaves the
   * page: the only trace is a CSP violation in the console.
   *
   * `privy.systems` carries the embedded wallet's own iframe origin, which is
   * separate from the auth host.
   */
  "https://auth.privy.io",
  "https://*.privy.io",
  "https://*.privy.systems",
  // Telegram's login widget talks back to its own origin. It was allowed to
  // render and to load its script, but not to speak, which is a blocked login
  // that looks like a dead button.
  "https://oauth.telegram.org",
  "https://telegram.org",
  // Supabase storage, which is where uploaded token artwork now lives. Already
  // covered by the Supabase wildcard above, listed here so it is not removed
  // by accident later.
].join(" ");

const CSP = [
  "default-src 'self'",
  /**
   * See the note above: relaxed on purpose, for wallet extensions.
   *
   * `challenges.cloudflare.com` is here for Privy, and it is what makes X
   * sign-in work on a desktop. Privy gates social login behind an invisible
   * Cloudflare Turnstile challenge, which it runs by injecting
   * `challenges.cloudflare.com/turnstile/v0/api.js` into this page before it
   * opens the OAuth popup. With the host missing from `script-src` that script
   * is refused, the challenge never resolves, the popup never opens, and
   * "Continue with X" does nothing at all with no error on screen.
   *
   * It only bit desktop. On a phone the same sign-in is a full-page redirect to
   * `auth.privy.io`, where the challenge runs on Privy's own origin under
   * Privy's CSP rather than this one, so it was never blocked there. Required
   * in `frame-src` too, below, for the widget's own iframe.
   *
   * `auth.privy.io` is here for the same family of reasons, and it is what
   * brings Telegram back. Privy injects scripts from its own origin into this
   * page, and Telegram's login is one of them: it loads
   * `auth.privy.io/js/telegram-login.js`. With the host absent this was refused
   * before the widget could render, which is the real reason Telegram sign-in
   * did nothing. It was read at the time as Telegram rejecting the
   * `auth.privy.io` origin; it was this CSP refusing Privy's own script, the
   * same shape of failure as X. Telegram's own origins stay in `connect-src`
   * and `frame-src` below for the widget's iframe and its callback.
   */
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org https://challenges.cloudflare.com https://auth.privy.io",
  "style-src 'self' 'unsafe-inline'",
  // data: for wallet icons, https: for token artwork from CoinGecko.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${CONNECT_SRC}`,
  /**
   * Privy renders its login modal and the embedded wallet in iframes, and
   * Telegram's login widget is an iframe on `oauth.telegram.org`. A blocked
   * frame fails the same silent way a blocked fetch does.
   */
  [
    "frame-src 'self'",
    "https://*.walletconnect.com",
    "https://*.walletconnect.org",
    "https://auth.privy.io",
    "https://*.privy.io",
    "https://*.privy.systems",
    // The other half of the Turnstile fix noted on `script-src`: the challenge
    // renders its own iframe from this host, so blocking it here fails the
    // sign-in the same silent way blocking the script did.
    "https://challenges.cloudflare.com",
    "https://oauth.telegram.org",
    /**
     * X, because desktop and mobile take different routes through OAuth.
     *
     * On a phone Privy redirects the whole page, which this directive does not
     * govern, so X sign-in worked there. On desktop the provider is opened
     * inside Privy's own frame, and `frame-src` decides whether that frame may
     * navigate to x.com. It could not, so the flow died silently after the
     * user had already approved on X: the approval succeeded and the return
     * trip was refused.
     *
     * Both hostnames, because X still serves and redirects between them.
     */
    "https://x.com",
    "https://twitter.com",
  ].join(" "),
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  /**
   * Where a form on this page may post.
   *
   * `'self'` alone breaks OAuth: the sign-in flow posts to the provider, and a
   * refused form submission looks identical to a provider that rejected you.
   * Only the identity hosts are added, so this still stops the page's own
   * forms being aimed anywhere else.
   */
  [
    "form-action 'self'",
    "https://auth.privy.io",
    "https://x.com",
    "https://twitter.com",
    "https://oauth.telegram.org",
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
        // The API is same-origin only. No CORS headers means no cross-origin
        // browser can read these, which matters for the expensive ones.
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
