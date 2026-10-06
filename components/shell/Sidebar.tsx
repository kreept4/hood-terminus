"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { clsx } from "@/lib/clsx";
import { useFiringAlerts } from "@/lib/alerts/store";
import { BRAND } from "@/lib/brand";
import { Logo } from "@/components/brand/Logo";
import { ConnectWallet } from "@/components/wallet/ConnectWallet";
import { useSidebar } from "@/components/shell/SidebarState";
import { useRouter } from "next/navigation";
import Dock from "@/components/shell/Dock";
import {
  IconTokens,
  IconTrack,
  IconWallet,  IconAlerts,
  IconTrade,
} from "@/components/shell/NavIcons";

/**
 * The application shell.
 *
 * A persistent rail rather than a top bar, because this is a tool people keep
 * open rather than a page they read once. The rail also gives creating a token
 * somewhere permanent to live: it is the first thing in the list and the only
 * thing wearing the accent, which is the correct weight for the one action the
 * product is actually paid for.
 *
 * On a phone the rail is replaced by a bottom bar. Primary navigation in a
 * trading product has to be one thumb tap, never a tap into a drawer.
 */

type Item = {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
};

/**
 * The rail, in three groups.
 *
 * Seven destinations in one flat list is seven things to read every time. They
 * split cleanly by what a reader is doing rather than by what the pages are:
 * looking at the market, doing something with their own money, or watching
 * somebody else. An ungrouped rail made "Trending" and "Portfolio" look like
 * the same kind of thing, which they are not.
 *
 * The group headings only exist when the rail is expanded. Collapsed, the
 * dividers between groups carry the same information without the words.
 */
type Group = { heading: string; items: readonly Item[] };

const GROUPS: readonly Group[] = [
  {
    heading: "Market",
    items: [
      { href: "/", label: "Tokens", Icon: IconTokens },
      /* New pairs and Trending used to be here. They are tabs on the Tokens
         board now, so having them in the nav as well gave two controls for one
         choice, in two places, that could disagree about which was selected.
         One market, one set of tabs. */
    ],
  },
  {
    heading: "You",
    items: [
      { href: "/portfolio", label: "Portfolio", Icon: IconWallet },
      { href: "/trade", label: "Trade", Icon: IconTrade },
      { href: "/alerts", label: "Alerts", Icon: IconAlerts },
    ],
  },
  {
    heading: "Watching",
    items: [{ href: "/wallets", label: "Track wallets", Icon: IconTrack }],
  },
];

/** The dock carries five, and creating a token is the middle one. */
const TABS: readonly (Item & { accent?: boolean })[] = [
  { href: "/", label: "Markets", Icon: IconTokens },
  { href: "/wallets", label: "Track wallets", Icon: IconTrack },
  { href: "/create", label: "Create", Icon: IconPlus, accent: true },
  { href: "/portfolio", label: "Portfolio", Icon: IconWallet },
  { href: "/alerts", label: "Alerts", Icon: IconAlerts },
];

/**
 * How many alerts are firing, on the item that leads to them.
 *
 * Firing, not configured. A count of rules never changes and so reads as a
 * permanent false alarm; this only appears when something a person asked to be
 * told about is actually true.
 *
 * Capped at 99 so a runaway count cannot widen the rail.
 *
 * Rendered inside the icon's stacking context so it rides along with the
 * collapsed rail and the dock without either needing its own layout.
 */
function AlertBadge({ count }: { count: number }) {
  if (count < 1) return null;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-green px-1 text-[10px] leading-none font-semibold text-on-accent tabular-nums"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Only one item is ever lit.
 *
 * The market links all point at sections of the same page, so matching on the
 * path alone lit three of them at once. An in-page link is only "current" when
 * it is the canonical one for that page, which is the first of them.
 */
function isActive(pathname: string, href: string): boolean {
  if (href.includes("#")) return false;
  if (href === "/") return pathname === "/" || pathname.startsWith("/t/");
  if (href === "/wallets") {
    return pathname.startsWith("/wallets") || pathname.startsWith("/w/");
  }
  return pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();
  const alertCount = useFiringAlerts();
  const router = useRouter();
  const { collapsed, toggle } = useSidebar();

  return (
    <>
      {/* ── Desktop rail ─────────────────────────────────────────── */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line-soft bg-ground md:flex",
          "transition-[width] duration-200 ease-out",
          collapsed ? "w-16" : "w-64",
        )}
      >
        {/* Its own band with a rule under it. The wordmark previously sat at
            the same indent and weight as the links below it, which made the
            product name read as a sixth destination. */}
        <div
          className={clsx(
            "flex items-center border-b border-line-soft py-4",
            collapsed ? "justify-center px-2" : "justify-between px-4",
          )}
        >
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2"
            aria-label={BRAND.name}
          >
            <Logo size={40} />
            {!collapsed && (
              <span className="truncate text-body font-bold tracking-tight text-ink">
                {BRAND.name}
              </span>
            )}
          </Link>
          {!collapsed && <RailToggle collapsed={collapsed} onToggle={toggle} />}
        </div>

        {collapsed && (
          <div className="flex justify-center px-2 pb-2">
            <RailToggle collapsed={collapsed} onToggle={toggle} />
          </div>
        )}

        {/* Hidden on the create page itself. Asking someone to go somewhere
            they already are is the most redundant button a rail can carry. */}
        {pathname !== "/create" && (
        <div className={collapsed ? "px-2 pt-8" : "px-3 pt-8"}>
          <Link
            href="/create"
            title={collapsed ? "Create a token" : undefined}
            className={clsx(
              "flex items-center justify-center gap-2 rounded-md bg-green",
              "text-body font-semibold text-on-accent",
              "transition-opacity duration-100 hover:opacity-90",
              collapsed ? "h-11 w-full" : "px-4 py-2.5",
            )}
          >
            <Plus />
            {!collapsed && "Create a token"}
          </Link>
        </div>
        )}

        <nav
          className={clsx(
            "mt-10 flex flex-col",
            collapsed ? "px-2" : "px-3",
          )}
        >
          {GROUPS.map((group, i) => (
            <div
              key={group.heading}
              className={clsx(
                i > 0 && "mt-5 border-t border-line-soft pt-5",
              )}
            >
              {!collapsed && (
                <p className="mb-2 px-3 text-micro text-ink-3">
                  {group.heading}
                </p>
              )}
              <Group
                items={group.items}
                pathname={pathname}
                collapsed={collapsed}
              />
            </div>
          ))}
        </nav>

        {/* Directly under the links rather than pinned to the floor. Pinned,
            they sat alone at the bottom of a tall empty column. */}
        {!collapsed && (
          <div className="mt-6 border-t border-line-soft px-3 pt-4">
            <ConnectWallet className="w-full justify-center" signInOnly />
          </div>
        )}

        <div className="flex-1" />
      </aside>

      {/* ── Mobile header ───────────────────────────────────────────── */}
      <MobileHeader />

      {/* ── Mobile dock ─────────────────────────────────────────────
          The bottom bar always was a dock: a fixed row of destinations on the
          edge of the screen. Magnifying the item under the thumb makes a small
          target easier to hit rather than harder, which is not true of most
          hover effects, so this is the one place it earns its place. ────── */}
      <div className="fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)] md:hidden">
        <Dock
          items={TABS.map(({ href, label, Icon, accent }) => ({
            icon: (
              <span className="relative">
                <Icon
                  className={
                    accent
                      ? "text-on-accent"
                      : isActive(pathname, href)
                        ? "text-ink"
                        : "text-ink-3"
                  }
                />
                {href === "/alerts" && <AlertBadge count={alertCount} />}
              </span>
            ),
            label,
            className: accent ? "dock-accent" : undefined,
            onClick: () => router.push(href),
          }))}
          panelHeight={62}
          baseItemSize={44}
          magnification={62}
          distance={120}
        />
      </div>

    </>
  );
}

function Group({
  items,
  pathname,
  collapsed,
}: {
  items: readonly Item[];
  pathname: string;
  collapsed: boolean;
}) {
  const alertCount = useFiringAlerts();

  return (
    <div className="flex flex-col gap-0.5">
      {items.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        const badge = href === "/alerts" ? alertCount : 0;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            title={collapsed ? label : undefined}
            className={clsx(
              "navitem group relative flex items-center overflow-hidden rounded-md text-body",
              collapsed ? "h-10 justify-center" : "gap-3 px-3 py-2",
              active
                ? "bg-surface-2 font-medium text-ink"
                : "text-ink-2 hover:text-ink",
            )}
          >
            {/* Fades up behind the label rather than around it, so nothing
                shifts by a pixel when the pointer arrives. */}
            <span aria-hidden="true" className="navitem-fill" />
            <span className="relative shrink-0">
              <Icon
                className={clsx(
                  "navitem-icon",
                  active ? "text-ink" : "text-ink-3 group-hover:text-ink",
                )}
              />
              <AlertBadge count={badge} />
            </span>
            {!collapsed && <span className="navitem-label relative">{label}</span>}
          </Link>
        );
      })}
    </div>
  );
}

function RailToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
      title={collapsed ? "Expand navigation" : "Collapse navigation"}
      className={clsx(
        "group flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
        "border border-transparent text-ink-3 transition-colors duration-150",
        "hover:border-line-soft hover:bg-surface-2 hover:text-ink",
      )}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        aria-hidden="true"
      >
        {/* The panel. */}
        <rect
          x="2"
          y="3.25"
          width="14"
          height="11.5"
          rx="2.4"
          stroke="currentColor"
          strokeWidth="1.35"
        />
        {/* The rail inside it, filled so the glyph reads as two regions rather
            than a box with a line through it. */}
        <path
          d="M2 5.65C2 4.32 3.08 3.25 4.4 3.25h2.05v11.5H4.4A2.4 2.4 0 0 1 2 12.35V5.65Z"
          fill="currentColor"
          className="opacity-30 transition-opacity duration-150 group-hover:opacity-45"
        />
        <path d="M6.45 3.25v11.5" stroke="currentColor" strokeWidth="1.35" />
        {/* Points the way the press will move it. */}
        <path
          d={collapsed ? "M9.9 6.9 12.2 9l-2.3 2.1" : "M12.4 6.9 10.1 9l2.3 2.1"}
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/** Sticky on mobile only, and it hides itself once the page starts moving. */
/**
 * The phone header, which condenses as you read down the page.
 *
 * It gives back about a fifth of its height and shrinks the wordmark, which on
 * a 14-rem-tall viewport is a row of the table you can see rather than a row
 * you have to scroll for.
 *
 * Deliberately gentle. A header that snaps between two sizes reads as the page
 * jumping under your thumb, and a shrink that goes too far turns the brand into
 * a smudge on the first flick. So the change is small, it takes 300ms on an
 * ease that settles rather than arrives, and it has hysteresis: it condenses
 * past 40px and only expands again below 12px. Without that gap a header sitting
 * exactly on the threshold flickers between both states while a finger rests on
 * the screen.
 *
 * Done in CSS transitions rather than an animation library. The whole effect is
 * two numbers moving on a scroll flag, which is what a transition already does,
 * and it costs nothing on a phone. GSAP earns its place on a timeline, not
 * here.
 */
function MobileHeader() {
  const [condensed, setCondensed] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        // Hysteresis, so a header resting on the threshold cannot oscillate.
        setCondensed((was) => (was ? y > 12 : y > 40));
      });
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <header
      style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      className={clsx(
        "sticky top-0 z-40 flex items-center px-4 md:hidden",
        "border-b transition-[height,background-color,border-color] duration-300",
        condensed
          ? "h-12 border-line-soft bg-ground/70 backdrop-blur-2xl backdrop-saturate-150"
          : "h-14 border-transparent bg-transparent",
      )}
    >
      <Link href="/" className="flex items-center gap-2" aria-label={BRAND.name}>
        <Logo size={20} />
        <span
          style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
          className={clsx(
            "font-semibold tracking-tight text-ink",
            "transition-[font-size,opacity] duration-300",
            condensed ? "text-small opacity-90" : "text-body opacity-100",
          )}
        >
          {BRAND.name}
        </span>
      </Link>

      {/* The phone had none of this.
          The rail that carries sign-in and the account menu is `hidden md:flex`,
          and nothing replaced it here, so on a phone there was no way to sign
          in from the chrome and no way to reach Disconnect at all. It is the
          same control the rail uses, in the same sign-in-only mode. */}
      <div className="ml-auto">
        <ConnectWallet signInOnly />
      </div>
    </header>
  );
}

function Plus() {
  return <IconPlus />;
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 14 14"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M7 1.5v11M1.5 7h11"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
