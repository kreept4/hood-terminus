import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { Logo } from "@/components/brand/Logo";
import { FooterGlide } from "@/components/shell/FooterGlide";
import { robinhoodChain } from "@/lib/chain";

/**
 * Site footer.
 *
 * No newsletter field: there is no list behind one, and a form that silently
 * does nothing is worse than no form. The fourth column is chain status, which
 * is something a trader wants and something we can state truthfully.
 */

const COLUMNS = [
  {
    heading: "Product",
    links: [
      { label: "Discover", href: "/" },
      { label: "Wallets", href: "/wallets" },
      { label: "Trade", href: "/trade" },
      { label: "Portfolio", href: "/portfolio" },
      { label: "Alerts", href: "/alerts" },
    ],
  },
  {
    heading: "Chain",
    links: [
      {
        label: "Block explorer",
        href: robinhoodChain.blockExplorers.default.url,
        external: true,
      },
      {
        label: "Robinhood Chain docs",
        href: "https://docs.robinhood.com/chain/",
        external: true,
      },

    ],
  },
  {
    heading: "Build",
    links: [
      { label: "Create a token", href: "/create" },
      { label: "Trade", href: "/trade" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms of use", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
    ],
  },
] as const;

export function Footer() {

  return (
    <FooterGlide>
      <footer className="relative mt-16 border-t border-line-soft bg-surface pb-24 md:mt-24 md:pb-0">
      <div className="gutter py-12 md:py-16">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <Logo size={26} />
          <span className="text-h3 font-bold text-ink">{BRAND.name}</span>
        </Link>

        <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-9 sm:grid-cols-2 md:mt-12 md:grid-cols-4">
          {COLUMNS.map((col) => (
            <nav key={col.heading} aria-label={col.heading}>
              <h2 className="text-body font-medium text-ink">
                {col.heading}
              </h2>
              <ul className="mt-4 flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <FooterLink
                      href={link.href}
                      external={"external" in link && link.external}
                    >
                      {link.label}
                    </FooterLink>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

        </div>
      </div>

      {/* Wordmark marquee. Whole letterforms: the band was cropping them to a
          sliver, which read as a rendering fault rather than as a crop. The
          size lives on the band so the track inherits it. */}
      <div
        aria-hidden="true"
        className="marquee relative z-0 text-mega border-t border-line-soft py-2 select-none"
      >
        <div className="marquee-track font-bold text-ink-3/20">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="pr-10">
              {BRAND.name}
            </span>
          ))}
        </div>
      </div>

      {/* relative and filled: whatever the marquee's crop does at a given
          viewport, the line under it is painted on top rather than beneath. */}
      <div className="gutter relative z-10 flex flex-wrap items-center justify-between gap-4 border-t border-line-soft bg-surface py-5">
        <p className="text-micro text-ink-3">
          Public chain data. Not financial advice. Rankings describe past
          trades, nothing more.
        </p>
      </div>
      </footer>
    </FooterGlide>
  );
}

function FooterLink({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  const className =
    "text-body text-ink-2 transition-colors duration-100 hover:text-ink";

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
