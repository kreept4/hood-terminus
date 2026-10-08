"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import {
  buildDeepLink,
  fetchMobileWallets,
  isInWalletBrowser,
  isMobileDevice,
  type MobileWallet,
} from "@/lib/wallet/deeplink";
import { clsx } from "@/lib/clsx";
import { truncateAddress } from "@/lib/format";
import { robinhoodChain } from "@/lib/chain";
import { DepositSheet } from "@/components/wallet/FundingSheets";
import { Sheet } from "@/components/wallet/Sheet";
import { useWalletAuth } from "@/lib/wallet/auth";

/**
 * Wallet connection.
 *
 * The list is built from what the browser actually reports rather than from a
 * hardcoded roster. Every wallet that announces itself over EIP-6963 arrives
 * with its own name and its own icon, so MetaMask appears as MetaMask with the
 * fox, and a wallet that shipped last week appears without anything being added
 * here.
 *
 * Wallets that are not installed are listed separately, and they link to the
 * vendor's own site rather than pretending to be connectable. Their tiles are
 * monograms, not logos: drawing somebody else's mark from memory produces a
 * near-miss, which looks worse than no mark at all.
 *
 * Scanning a QR code is WalletConnect, and WalletConnect needs a project ID.
 * Without one the option is absent rather than present and broken.
 *
 * Above all of it sits sign-in, for the people this list has no answer for.
 * Someone who arrives from a posted link with nothing installed cannot be
 * helped by a roster of wallets they do not have, and telling them to go and
 * get one is where they leave. It is first in the sheet because it is the only
 * option that works for them, and it is absent entirely when Privy is not
 * configured rather than present and dead.
 */

const CONNECTOR_META: Record<string, { description: string }> = {
  injected: { description: "Whatever this browser has installed" },
  coinbaseWalletSDK: { description: "Extension or mobile app" },
  walletConnect: { description: "Scan a QR code with any mobile wallet" },
};

/**
 * Wallets worth naming when they are not installed.
 *
 * Each links to the vendor's own download page. The point is to answer "my
 * wallet isn't here" without leaving someone to search for it.
 */
const KNOWN = [
  { name: "MetaMask", url: "https://metamask.io/download/" },
  { name: "Rabby", url: "https://rabby.io/" },
  { name: "Phantom", url: "https://phantom.com/download" },
  { name: "Coinbase Wallet", url: "https://www.coinbase.com/wallet/downloads" },
  { name: "Trust Wallet", url: "https://trustwallet.com/download" },
  { name: "OKX Wallet", url: "https://web3.okx.com/download" },
  { name: "Rainbow", url: "https://rainbow.me/download" },
  { name: "Zerion", url: "https://zerion.io/download" },
  { name: "Brave Wallet", url: "https://brave.com/wallet/" },
  { name: "Frame", url: "https://frame.sh/" },
];

export function ConnectWallet({
  className,
  compact = false,
  signInOnly = false,
  walletOnly = false,
  label = "Sign in",
}: {
  className?: string;
  /** Icon only. For tight rows where a labelled button does not fit. */
  compact?: boolean;
  /**
   * Offers sign-in and nothing else.
   *
   * The nav uses this. Linking an existing wallet is not a way into the
   * product, it is something you do once you are already in and about to spend
   * something, so it belongs beside the launch and trade forms rather than in
   * the chrome of every page. Offering it in the nav made the first thing a
   * visitor saw a list of software they probably do not have.
   *
   * Ignored when Privy is not configured, since the wallet list is then the
   * only way in and hiding it would leave a button that opens an empty sheet.
   */
  signInOnly?: boolean;
  /**
   * The mirror of `signInOnly`: wallets and no sign-in.
   *
   * Used where both are offered as separate, visible choices rather than as one
   * sheet a reader has to open before they learn what is in it. Fusing them
   * meant a single button whose meaning depended on what you found inside, and
   * the nav does not work that way, so the create form should not either.
   */
  walletOnly?: boolean;
  /** Trigger text. The default suits the nav; the create form names each path. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending, error, variables } = useConnect();
  const { disconnect } = useDisconnect();
  const auth = useWalletAuth();

  if (isConnected && address) {
    return (
      <AccountMenu
        address={address}
        onDisconnect={() => {
          disconnect();
          /**
           * Both, and in this order.
           *
           * Disconnecting wagmi alone leaves the Privy session standing, and
           * the bridge would hand the wallet straight back on the next render:
           * the button would say Disconnect, be pressed, and change nothing.
           */
          if (auth?.authenticated) void auth.logout();
        }}
        className={className}
      />
    );
  }

  /**
   * Signed in, with no wallet attached.
   *
   * Three states, not two. `isConnected` above answers "is there a wallet",
   * which is not the same question as "is this person signed in": Privy can
   * hold a completed session while the account has no embedded wallet, which is
   * what happens while wallet creation is off for the app.
   *
   * Treating that as signed-out was the bug. The trigger read "Connect wallet"
   * to somebody who had just signed in, so the only available reading was that
   * the sign-in had failed. It had not. Showing the identity we actually hold,
   * and explaining the missing half inside, is the honest version.
   *
   * Only where this button is the account, which is the nav. `signInOnly` and
   * `walletOnly` are specific calls to action sitting side by side, and
   * replacing both their labels with the same handle produced two identical
   * buttons under a prompt telling somebody to sign in who already had. A
   * button that says who you are is an account chip; one that says what it does
   * is a control, and these are controls.
   */
  const signedInWithoutWallet = Boolean(
    auth?.ready && auth?.authenticated && !signInOnly && !walletOnly,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={signedInWithoutWallet ? "Signed in, no wallet yet" : label}
        title={
          signedInWithoutWallet
            ? "Signed in. No wallet attached yet."
            : compact
              ? label
              : undefined
        }
        className={clsx(
          "flex items-center justify-center rounded-md border text-ink",
          "transition-colors duration-100 hover:border-green hover:text-green",
          signedInWithoutWallet ? "border-amber-line" : "border-line",
          compact ? "tap-44 h-9 w-9" : "gap-2 px-3 py-1.5 text-body",
          className,
        )}
      >
        {signedInWithoutWallet && auth?.avatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={auth.avatarUrl}
            alt=""
            width={20}
            height={20}
            className="h-5 w-5 shrink-0 rounded-full"
          />
        ) : (
          <IconWalletSmall />
        )}
        {!compact &&
          (signedInWithoutWallet
            ? (auth?.handle ?? "Signed in")
            : label)}
      </button>

      <AnimatePresence>
        {open && (
          <WalletSheet
            key="connect"
            signInOnly={signInOnly}
            walletOnly={walletOnly}
            connectors={connectors}
            onConnect={(connector) => {
              /**
               * Guarded and self-closing, on the same condition the sheet is
               * shown under.
               *
               * The guard stops a second click on an already-connected wallet
               * throwing "Connector already connected", and the close is there
               * because a second click is exactly what someone does when
               * nothing told them the first one worked.
               *
               * It reads `address` as well as `isConnected` because those two
               * disagree while wagmi is reconnecting: `isConnected` turns true
               * first and the address arrives after. This component renders
               * the sheet on `isConnected && address`, so during that window
               * the sheet was on screen while the guard already believed the
               * work was done, and every row in it silently closed the sheet
               * instead of connecting anything. Both conditions have to be the
               * same condition.
               */
              if (isConnected && address) {
                setOpen(false);
                return;
              }
              connect({ connector }, { onSuccess: () => setOpen(false) });
            }}
            isPending={isPending}
            pendingConnector={variables?.connector}
            error={error}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * The way in for somebody with no wallet at all.
 *
 * Deliberately the loudest thing in the sheet. Every other option here assumes
 * software the visitor already installed, and the ones who did not are exactly
 * the ones a shared link brings. One tap, an email or an X account, and they
 * come back holding an address that the rest of this app cannot tell apart
 * from MetaMask.
 *
 * It closes the sheet on tap rather than waiting for the result: Privy opens
 * its own modal on top, and leaving ours underneath would stack two dialogs
 * and two close buttons on a phone screen.
 */
/** The square mark at the head of each row. */
function Tile({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 text-ink">
      {children}
    </span>
  );
}

const ROW =
  "flex w-full items-center gap-3 rounded-lg border border-line bg-surface-2/40 px-3 py-2.5 " +
  "text-left text-body font-medium text-ink transition-colors duration-100 " +
  "hover:border-green-line hover:bg-surface-2";

function SignIn({
  auth,
  onDone,
  showWalletDivider,
}: {
  auth: NonNullable<ReturnType<typeof useWalletAuth>>;
  onDone: () => void;
  showWalletDivider: boolean;
}) {

  /**
   * Never gated on the SDK being ready.
   *
   * `ready` flips once, after Privy answers. When that answer never arrives it
   * stays false for the life of the page, and gating on it leaves the primary
   * way into the product dead with nothing that will ever revive it.
   */
  /**
   * Opens Privy's own modal, with no method pinned and nothing prefilled.
   *
   * This used to pass `loginMethods` and `prefill` so the sheet could own the
   * whole look of signing in. That is the whitelabel path, and Privy documents
   * that automatic wallet creation does not run on it: `createOnLogin` only
   * applies to a login through their modal. The result was a session with no
   * wallet attached, which is not a state this product has any use for, since
   * every action past sign-in needs an address.
   *
   * So the methods are chosen in Privy's modal now. The visible cost is one
   * extra surface in the flow. What it buys is a wallet, which is the entire
   * reason anybody signs in here. The dashboard already decides which methods
   * appear, so nothing about that changes.
   */
  function begin() {
    try {
      // Email and X only. Still Privy's modal, so wallet creation applies; the
      // list only narrows which methods it offers. Telegram is out because it
      // never completed a sign-in, see `lib/wallet/auth.ts`.
      auth.login({ methods: ["email", "twitter"] });
    } catch (e) {
      /**
       * Logged, not swallowed. Silence made "sign in does not work" an
       * unreportable bug: no modal, no error, nothing to work back from.
       */
      console.error("[sign-in] Privy refused to open the login modal.", e);
      return;
    }
    onDone();
  }

  /**
   * Signed in, but with no wallet to show for it.
   *
   * This sheet is reached from wagmi's `isConnected`, which needs a wallet, not
   * an identity. Privy can hold a completed session while the account has no
   * embedded wallet attached, which happens when wallet creation is off in the
   * Privy dashboard, and `PrivyBridge` deliberately no longer forces one.
   *
   * The methods below are then dead in a way nobody could diagnose from the
   * outside: every button calls `login`, Privy answers "already logged in, use
   * a link helper", and the sheet does nothing at all. That is exactly what it
   * looked like from the chair. Offering a sign-in to somebody already signed
   * in is the dishonest state here, so say what happened and give the one
   * control that resolves it.
   */
  if (auth.authenticated) {
    return (
      <div className="mb-5">
        <div className="rounded-md border border-line bg-surface-2 px-4 py-4">
          <p className="text-body text-ink">You are already signed in.</p>
          <p className="mt-2 text-micro leading-relaxed text-ink-3">
            This account has no wallet attached, so there is nothing to trade
            with yet. Signing out and back in will attach one once wallet
            creation is enabled for the app.
          </p>
          <button
            type="button"
            onClick={() => {
              void auth.logout();
              onDone();
            }}
            className="mt-3 rounded-md border border-line px-3 py-2 text-body text-ink transition-colors duration-100 hover:border-green hover:text-green"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5">
      {/* One way in, which opens Privy's modal.

          Three rows used to live here, one per method, each pinning its method
          through `loginMethods`. They looked better and they did not work: that
          is the whitelabel path, where Privy skips wallet creation, so people
          arrived signed in with no address and nothing they could do. The marks
          stay as a signal of what is behind the button, because which of these
          a person has is still not something we get to have an opinion about. */}
      <button type="button" onClick={begin} className={ROW}>
        <span className="flex items-center gap-1.5">
          <Tile>
            <IconMail />
          </Tile>
          <Tile>
            <IconX />
          </Tile>
        </span>
        <span className="min-w-0 flex-1 text-left">
          Sign in with email or social
        </span>
      </button>

      {/* The only line left under the methods, and only because it was asked
          for. It answers "who is holding my keys" for the reader most likely
          to leave without an answer. */}
      <p className="mt-4 text-center text-micro text-ink-3/70">
        Powered by Privy
      </p>

      {showWalletDivider && (
        <div className="mt-5 mb-3 flex items-center gap-3">
          <span className="h-px flex-1 bg-line-soft" />
          <span className="text-micro text-ink-3">or link a wallet you have</span>
          <span className="h-px flex-1 bg-line-soft" />
        </div>
      )}
    </div>
  );
}

type UseConnect = ReturnType<typeof useConnect>;
type Connector = UseConnect["connectors"][number];

function WalletSheet({
  signInOnly,
  walletOnly,
  connectors,
  onConnect,
  isPending,
  pendingConnector,
  error,
  onClose,
}: {
  signInOnly: boolean;
  walletOnly: boolean;
  connectors: UseConnect["connectors"];
  /* A callback rather than wagmi's `connect` itself. Passing the mutation down
     drags its config generic with it, and the chain id narrows to the literal
     4663 on one side and widens to `number` on the other. */
  onConnect: (connector: Connector) => void;
  isPending: boolean;
  pendingConnector: unknown;
  error: Error | null;
  onClose: () => void;
}) {
  const auth = useWalletAuth();
  const [query, setQuery] = useState("");
  // Wallets whose advertised icon failed to load. EIP-6963 icons are data URIs
  // supplied by the extension, and a malformed one would otherwise leave a
  // blank box where the logo should be.
  const [brokenIcons, setBrokenIcons] = useState<Set<string>>(new Set());
  // The WalletConnect pairing URI, once the connector has opened a session.
  const [uri, setUri] = useState<string | null>(null);

  // Phones get a different picker entirely. See `openWallet` below.
  const [onPhone, setOnPhone] = useState(false);
  const [mobileWallets, setMobileWallets] = useState<MobileWallet[]>([]);
  // The wallet awaiting a pairing URI, so the redirect can fire once it lands.
  const [pendingWallet, setPendingWallet] = useState<MobileWallet | null>(null);
  const search = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    /**
     * The registry is fetched on every device, for two different reasons.
     *
     * On a phone it supplies deep links, and the picker becomes a list of apps
     * to open. On desktop it supplies the one thing the "not installed" list
     * never had: real logos. That list drew monograms because the names were
     * hardcoded here with no artwork behind them, and a column of single
     * letters beside "Install" reads as a placeholder rather than a wallet.
     *
     * Inside a wallet's own browser the injected connector already works, and a
     * deep link would throw somebody out of the app they are standing in, so
     * the phone path is skipped there.
     */
    const phone = isMobileDevice() && !isInWalletBrowser();
    setOnPhone(phone);
    void fetchMobileWallets(!phone).then(setMobileWallets);
  }, []);


  /**
   * Nothing is focused on open any more.
   *
   * The wallet search used to take focus, which was right when this sheet was
   * only a wallet list. It is now the secondary half of a sheet that leads with
   * an email field, so autofocusing it put the caret in the wrong box and, on a
   * phone, raised the keyboard for a field most people will never use.
   *
   * Locking the page and listening for Escape belong to `Sheet`, which owns the
   * dialog both sheets render into.
   */

  // EIP-6963 gives each installed wallet its own connector. The generic
  // `injected` entry is only worth showing when nothing announced itself,
  // otherwise it offers the same wallet twice under a worse name.
  const discovered = useMemo(
    () => connectors.filter((c) => c.type === "injected" && c.id !== "injected"),
    [connectors],
  );
  const walletConnect = connectors.find((c) => c.id === "walletConnect");

  /**
   * Opens a pairing session up front, before any wallet is chosen.
   *
   * This exists because of how iOS treats navigation. A redirect only leaves
   * the browser if it happens inside the user gesture that caused it, and the
   * pairing URI does not exist at tap time: WalletConnect emits it
   * asynchronously once a session is opening. Waiting for it means redirecting
   * from a promise callback, by which point the gesture is over and Safari
   * silently drops the navigation. Nothing happens, and nothing says why.
   *
   * So the session is opened when the sheet is, and by the time anything is
   * tapped the URI is already in hand and the redirect is synchronous. The
   * pairing costs nothing if it goes unused; it expires on its own.
   */
  useEffect(() => {
    if (!onPhone || !walletConnect || uri || isPending) return;
    onConnect(walletConnect);
    // Deliberately keyed on the trigger alone. Re-running this whenever
    // `isPending` settles would open a second session on top of the first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPhone, walletConnect]);

  /**
   * Fallback for a tap that beat the URI.
   *
   * Rare, and not worth blocking the tap on, so the redirect just fires when
   * the URI lands instead. On iOS this is the case that can be swallowed, so
   * it is the exception rather than the path.
   */
  useEffect(() => {
    if (!uri || !pendingWallet) return;
    const link = buildDeepLink(pendingWallet, uri);
    setPendingWallet(null);
    if (link) window.location.href = link;
  }, [uri, pendingWallet]);

  // The connector emits `display_uri` once it has a pairing to show. Listening
  // rather than polling, because the session opens asynchronously and there is
  // no way to ask for the URI before it exists.
  useEffect(() => {
    if (!walletConnect) return;

    // Named, so the same reference can be removed. Passing a new arrow to
    // `off` removes nothing and leaks a listener on every open.
    function onMessage(event: { type: string; data?: unknown }) {
      if (event.type === "display_uri" && typeof event.data === "string") {
        setUri(event.data);
      }
    }

    walletConnect.emitter.on("message", onMessage);
    return () => {
      walletConnect.emitter.off("message", onMessage);
    };
  }, [walletConnect]);

  const available = useMemo(() => {
    const list = connectors.filter((c) =>
      c.id === "injected" ? discovered.length === 0 : c.id !== "walletConnect",
    );
    const q = query.trim().toLowerCase();
    return q ? list.filter((c) => c.name.toLowerCase().includes(q)) : list;
  }, [connectors, discovered.length, query]);

  const installedNames = new Set(
    connectors.map((c) => c.name.toLowerCase()),
  );
  const notInstalled = useMemo(() => {
    const q = query.trim().toLowerCase();
    return KNOWN.filter(
      (w) =>
        !installedNames.has(w.name.toLowerCase()) &&
        (q === "" || w.name.toLowerCase().includes(q)),
    );
  }, [installedNames, query]);

  const nothing = available.length === 0 && notInstalled.length === 0;

  /**
   * Whether to draw the wallet half of this sheet at all.
   *
   * `signInOnly` hides it for the nav, but only when there is something to hide
   * it in favour of. With Privy unconfigured `auth` is null, and suppressing
   * the wallets as well would leave a Sign in button that opens an empty sheet.
   */
  const walletHalf = walletOnly || !signInOnly || !auth;

  return (
    <Sheet
      label="Sign in"
      title={walletOnly ? "Link a wallet" : auth ? "Sign in" : "Link a wallet"}
      onClose={onClose}
    >
          {auth && !walletOnly && query.trim() === "" && (
            <SignIn
              auth={auth}
              onDone={onClose}
              // The rule that introduces the wallet list is only worth drawing
              // when there is a wallet list under it.
              showWalletDivider={!signInOnly}
            />
          )}

          {walletHalf && (
          <>
          {/* Under the sign-in block, not above it.
              Pinned to the header it was the first thing in the sheet, so a
              sheet whose whole point is "sign in with an email" opened by
              asking which wallet you were looking for. It belongs to the wallet
              list, so it sits with the wallet list. */}
          <div className="mb-3">
            <input
              ref={search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search wallets"
              spellCheck={false}
              className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-body text-ink placeholder:text-ink-3 focus:border-green focus:outline-none"
            />
          </div>

          {onPhone && walletConnect && mobileWallets.length > 0 && (
            <div className="mb-4 flex flex-col gap-1.5">
              {mobileWallets
                .filter(
                  (w) =>
                    query.trim() === "" ||
                    w.name.toLowerCase().includes(query.trim().toLowerCase()),
                )
                .map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    /**
                     * Never disabled.
                     *
                     * A pairing session is opened as soon as this sheet does,
                     * so `isPending` is true from the moment the list appears
                     * and stays true until someone connects. Disabling on it
                     * greyed out every wallet and made none of them tappable,
                     * which read as a dead list rather than a busy one.
                     */
                    onClick={() => {
                      // Synchronous whenever possible, so the navigation is
                      // still inside the gesture that asked for it.
                      const link = uri ? buildDeepLink(w, uri) : null;
                      if (link) {
                        window.location.href = link;
                        return;
                      }
                      setPendingWallet(w);
                      onConnect(walletConnect);
                    }}
                    className="flex items-center gap-3 rounded-md border border-line-soft px-3 py-2.5 text-left transition-colors duration-100 hover:border-line hover:bg-surface-2 active:bg-surface-2"
                  >
                    {/* Same fallback as the installed list. These logos come
                        from WalletConnect's registry over the network, so one
                        that 404s or is blocked left a blank square where the
                        mark should be, which reads as a broken row rather than
                        a wallet. */}
                    {brokenIcons.has(w.id) ? (
                      <Monogram name={w.name} />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={w.image}
                        alt=""
                        width={28}
                        height={28}
                        loading="lazy"
                        className="h-7 w-7 shrink-0 rounded-md"
                        onError={() =>
                          setBrokenIcons((prev) => new Set(prev).add(w.id))
                        }
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-body text-ink">
                      {w.name}
                    </span>
                    {pendingWallet?.id === w.id && (
                      <span className="shrink-0 text-micro text-ink-3">
                        Opening
                      </span>
                    )}
                  </button>
                ))}
            </div>
          )}

          {available.length > 0 && (
            <>
              <p className="mb-2 text-micro text-ink-3">Installed</p>
              <div className="mb-5 flex flex-col gap-1.5">
                {available.map((connector) => {
                  const meta = CONNECTOR_META[connector.id];
                  const connecting =
                    isPending && pendingConnector === connector;
                  return (
                    <button
                      key={connector.uid}
                      type="button"
                      /**
                       * Never disabled, and dimmed only where the work is.
                       *
                       * `isPending` belongs to the one connect attempt in
                       * flight, but it was disabling and fading every row in
                       * the list. That is fine for the second it takes a
                       * wallet to answer and wrong for every case where it
                       * does not: dismissing MetaMask's popup, or a wallet
                       * that opens and is left alone, leaves the mutation
                       * pending with nothing left to resolve it. The list then
                       * sits greyed out and refuses every click, which reads
                       * as a dead sheet rather than a busy one, and the only
                       * way out is a page reload.
                       *
                       * Picking another wallet during an attempt is also a
                       * reasonable thing to do. It is what someone does after
                       * choosing the wrong one, and wagmi handles the swap.
                       */
                      onClick={() => onConnect(connector)}
                      className={clsx(
                        "flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5 text-left",
                        "transition-colors duration-100 hover:border-green-line hover:bg-surface-2",
                        connecting && "opacity-60",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        {connector.icon && !brokenIcons.has(connector.uid) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={connector.icon}
                            alt=""
                            width={26}
                            height={26}
                            className="h-[26px] w-[26px] shrink-0 rounded-sm object-contain"
                            onError={() =>
                              setBrokenIcons((prev) =>
                                new Set(prev).add(connector.uid),
                              )
                            }
                          />
                        ) : (
                          <Monogram name={connector.name} />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-body font-medium text-ink">
                            {connector.name}
                          </span>
                          {meta && (
                            <span className="block truncate text-micro text-ink-3">
                              {meta.description}
                            </span>
                          )}
                        </span>
                      </span>
                      {connecting && (
                        <span className="shrink-0 text-micro text-ink-3">
                          Connecting
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {notInstalled.length > 0 && (
            <>
              <p className="mb-2 text-micro text-ink-3">Not installed</p>
              <div className="flex flex-col gap-1.5">
                {notInstalled.map((w) => (
                  <a
                    key={w.name}
                    href={w.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 rounded-md border border-line-soft px-3 py-2.5 transition-colors duration-100 hover:border-line hover:bg-surface-2"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      {/* The registry's own artwork, matched by name. A
                          monogram remains the fallback for a wallet the
                          registry does not carry, because drawing somebody
                          else's mark from memory produces a near-miss that
                          looks worse than two letters. */}
                      {registryLogo(w.name, mobileWallets) &&
                      !brokenIcons.has(w.name) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={registryLogo(w.name, mobileWallets)!}
                          alt=""
                          width={26}
                          height={26}
                          loading="lazy"
                          onError={() =>
                            setBrokenIcons((prev) => new Set(prev).add(w.name))
                          }
                          className="h-[26px] w-[26px] shrink-0 rounded-md object-contain"
                        />
                      ) : (
                        <Monogram name={w.name} />
                      )}
                      <span className="truncate text-body text-ink-2">
                        {w.name}
                      </span>
                    </span>
                    <span className="shrink-0 text-micro text-ink-3">
                      Install
                    </span>
                  </a>
                ))}
              </div>
            </>
          )}

          {nothing && (
            <p className="py-8 text-center text-body text-ink-3">
              Nothing matches that name.
            </p>
          )}

          {!walletConnect && (
            <p className="mt-5 border-t border-line-soft pt-4 text-micro text-ink-3">
              Scanning a QR code needs WalletConnect, which is not configured on
              this deployment. Browser wallets above are unaffected.
            </p>
          )}

          </>
          )}

      {error && (
        <p className="mt-4 text-micro text-red">
          {error.message.length > 120
            ? "Could not connect. Check the wallet is unlocked and try again."
            : error.message}
        </p>
      )}
    </Sheet>
  );
}

/**
 * A stand-in tile for a wallet with no icon.
 *
 * An initial on a neutral tile, never an approximation of the vendor's mark.
 * A logo drawn from memory is recognisably wrong, which reads worse than
 * plainly not having one.
 */
function Monogram({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-sm border border-line-soft bg-surface-2 text-micro font-semibold text-ink-2"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * The connected account.
 *
 * A menu rather than a bare icon. Disconnecting was an unlabelled glyph, which
 * is fine as a shortcut and useless as the only route to the action.
 */
function AccountMenu({
  address,
  onDisconnect,
  className,
}: {
  address: string;
  onDisconnect: () => void;
  className?: string;
}) {
  const auth = useWalletAuth();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [brokenAvatar, setBrokenAvatar] = useState(false);

  /**
   * Whether the signed-in identity actually belongs to the wallet on screen.
   *
   * These come apart. Connect MetaMask, then sign in with X, and Privy
   * authenticates the X account while wagmi is still connected to MetaMask. The
   * nav then put an X handle and avatar above somebody else's address, which
   * reads as "this X account is that wallet" and is not true of either.
   *
   * The identity is only shown when the connected address is the wallet Privy
   * holds for that account. Otherwise the address speaks for itself.
   */
  const ownIdentity =
    Boolean(auth?.embeddedAddress) &&
    auth?.embeddedAddress?.toLowerCase() === address.toLowerCase();
  const box = useRef<HTMLDivElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);

  /**
   * Where the menu is drawn, in viewport coordinates.
   *
   * The menu used to be `absolute` inside this component, which meant any
   * ancestor with `overflow` could cut it in half. It has two of them: `Card`'s
   * body is `overflow-y-auto`, and this same control sits inside one on the
   * create and trade panels, so everything past the first item or two was
   * simply clipped away. Disconnect is the last item in the list, so it was the
   * first thing to disappear and the one nobody could find.
   *
   * A portal to `document.body` takes it out of reach of every one of those
   * ancestors at once, which is the only fix that does not need auditing every
   * place this control is ever mounted. The cost is positioning it ourselves.
   */
  const [at, setAt] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;

    function place() {
      const trigger = box.current;
      if (!trigger) return;
      const r = trigger.getBoundingClientRect();

      // Roughly what the menu needs. Measuring the real height would take a
      // paint, and being a little conservative only flips it up slightly early.
      const NEEDED = 250;
      const GAP = 8;
      const room = window.innerHeight - r.bottom;

      setAt(
        room < NEEDED && r.top > room
          ? // No room underneath, and more above: open upward instead of
            // running off the bottom of the screen.
            { left: r.left, width: r.width, bottom: window.innerHeight - r.top + GAP }
          : { left: r.left, width: r.width, top: r.bottom + GAP },
      );
    }

    place();

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      // Both, now that the menu is no longer a descendant of the trigger.
      if (box.current?.contains(target) || menu.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    // Fixed coordinates go stale the moment anything moves, and `true` catches
    // scrolling inside a panel rather than only on the page.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked. The full address is on screen to copy by hand.
    }
  }

  return (
    <div ref={box} className={clsx("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={clsx(
          "flex w-full items-center justify-center gap-2 rounded-md border border-line",
          "px-3 py-1.5 text-body text-ink transition-colors duration-100",
          "hover:border-green hover:text-green",
        )}
      >
        {/* A face and a handle when the person signed in as somebody, the
            address when they arrived as a wallet. An address is a fine
            identifier and a poor name, and the nav is a place for a name. */}
        {ownIdentity && auth?.avatarUrl && !brokenAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={auth.avatarUrl}
            alt=""
            width={20}
            height={20}
            className="h-5 w-5 shrink-0 rounded-full object-cover"
            onError={() => setBrokenAvatar(true)}
          />
        ) : null}
        <span className={clsx("truncate", !(ownIdentity && auth?.handle) && "tnum")}>
          {(ownIdentity && auth?.handle) || truncateAddress(address)}
        </span>
        <Chevron open={open} />
      </button>

      {open &&
        at &&
        typeof document !== "undefined" &&
        createPortal(
        <div
          ref={menu}
          role="menu"
          style={{
            position: "fixed",
            left: at.left,
            width: at.width,
            ...(at.top !== undefined ? { top: at.top } : { bottom: at.bottom }),
          }}
          className={clsx(
            "z-50 overflow-hidden rounded-md",
            "border border-line-soft bg-surface p-1",
            "shadow-[0_18px_36px_-14px_var(--shadow-2)]",
          )}
        >
          <p className="tnum px-2.5 pt-2 pb-1 text-micro break-all text-ink-3">
            {address}
          </p>

          <MenuItem onClick={copy}>{copied ? "Copied" : "Copy address"}</MenuItem>

          <MenuItem
            onClick={() => {
              setDepositing(true);
              setOpen(false);
            }}
          >
            Add funds
          </MenuItem>

          <a
            role="menuitem"
            href={`${robinhoodChain.blockExplorers.default.url}/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className={MENU_ITEM}
          >
            View on explorer
          </a>

          <div className="my-1 h-px bg-line-soft" />

          <MenuItem
            onClick={() => {
              onDisconnect();
              setOpen(false);
            }}
            tone="danger"
          >
            Disconnect
          </MenuItem>
        </div>,
        document.body,
      )}

      <AnimatePresence>
        {depositing && (
          <DepositSheet
            key="deposit"
            address={address}
            onClose={() => setDepositing(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const MENU_ITEM =
  "block w-full rounded-sm px-2.5 py-2 text-left text-body text-ink-2 " +
  "transition-colors duration-100 hover:bg-surface-2 hover:text-ink";

function MenuItem({
  children,
  onClick,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={clsx(MENU_ITEM, tone === "danger" && "hover:text-red")}
    >
      {children}
    </button>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={clsx(
        "ml-auto shrink-0 transition-transform duration-150",
        open && "rotate-180",
      )}
    >
      <path
        d="M2.8 4.4 6 7.6l3.2-3.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMail() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect x="2.75" y="5" width="18.5" height="14" rx="2.5" />
      <path d="M3.5 7.5l7.35 5.06a2 2 0 0 0 2.3 0L20.5 7.5" />
    </svg>
  );
}

function IconX() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function IconWalletSmall() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="1.9" y="3.6" width="12.2" height="9" rx="2" />
      <path d="M10.6 8.1h3.5" />
    </svg>
  );
}


/**
 * A wallet's logo from the WalletConnect registry, matched by name.
 *
 * Loose matching on purpose: the registry calls it "MetaMask" and our list
 * calls it "MetaMask", but "Coinbase Wallet" and "OKX Wallet" have drifted in
 * both directions over the years. Comparing on letters alone survives that.
 */
function registryLogo(name: string, registry: MobileWallet[]): string | null {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const hit = registry.find(
    (w) => w.name.toLowerCase().replace(/[^a-z0-9]/g, "") === key,
  );
  return hit?.image ?? null;
}
