"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { useAccount, useConnect } from "wagmi";
import { useDisconnectAll, clearDisconnected } from "@/lib/wallet/disconnect";
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
 * Sign-in used to sit above all of it, for the people this list has no answer
 * for: someone arriving from a posted link with nothing installed cannot be
 * helped by a roster of wallets they do not have. It was removed because it
 * never produced a wallet on this app, and an option that authenticates you
 * and then strands you is worse than no option. See `Web3Providers`.
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
  label = "Connect a wallet",
}: {
  className?: string;
  /** Icon only. For tight rows where a labelled button does not fit. */
  compact?: boolean;
  /** Trigger text. The default suits the nav; the create form names each path. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending, error, variables } = useConnect();
  const disconnectAll = useDisconnectAll();

  if (isConnected && address) {
    return (
      <AccountMenu
        address={address}
        onDisconnect={() => void disconnectAll()}
        className={className}
      />
    );
  }


  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={compact ? label : undefined}
        className={clsx(
          "flex items-center justify-center rounded-md border text-ink",
          "transition-colors duration-100 hover:border-green hover:text-green",
          "border-line",
          compact ? "tap-44 h-9 w-9" : "gap-2 px-3 py-1.5 text-body",
          className,
        )}
      >
        <IconWalletSmall />
        {!compact && label}
      </button>

      <AnimatePresence>
        {open && (
          <WalletSheet
            key="connect"
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
              // Picking a wallet is consent to be connected, which retires the
              // record of an earlier disconnect.
              clearDisconnected();
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

type UseConnect = ReturnType<typeof useConnect>;
type Connector = UseConnect["connectors"][number];

function WalletSheet({
  connectors,
  onConnect,
  isPending,
  pendingConnector,
  error,
  onClose,
}: {
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

  // Always. Sign-in is gone, so the wallet list is the whole sheet.
  const walletHalf = true;

  return (
    <Sheet
      label="Connect a wallet"
      title="Connect a wallet"
      onClose={onClose}
    >

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
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [depositing, setDepositing] = useState(false);

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
        {/* The address, which is the only identity there is now. A face and a
            handle used to show here when somebody signed in as a person rather
            than as a wallet; that came from Privy and went with it. */}
        <span className="tnum truncate">{truncateAddress(address)}</span>
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
