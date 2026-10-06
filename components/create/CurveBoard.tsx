import Link from "next/link";
import { Card } from "@/components/primitives/Card";
import { TokenLogo } from "@/components/market/TokenLogo";
import type { CurveToken } from "@/lib/launchpad/curve";
import { quoteAsset } from "@/lib/launchpad/quotes";
import { QuoteLogo } from "@/components/market/QuoteLogo";

/**
 * Tokens still filling their curve.
 *
 * The only place these are visible anywhere. A curve token has no pool, and
 * every aggregator indexes pools, so until it graduates this board is the
 * entire market for it. That makes it the most important list on the site
 * rather than a supplementary one.
 */
export function CurveBoard({ tokens }: { tokens: CurveToken[] }) {
  if (tokens.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tokens.map((t) => (
        <Card key={t.address} className="flex flex-col gap-3 p-4">
          {/* What this token is, in two words.
              The pairing is the reason to look twice at a memecoin on this
              chain, and a creator tax is a cost a buyer should meet on the card
              rather than in the trade panel. Neither is visible anywhere else. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 rounded-sm border border-green-line bg-green-deep px-1.5 py-0.5 text-micro font-medium text-green">
              <QuoteLogo quote={t.quote} size={12} />
              {quoteAsset(t.quote).symbol}
            </span>
            {t.creatorTaxBps > 0 && (
              <span className="rounded-sm border border-line px-1.5 py-0.5 text-micro text-ink-3">
                {t.creatorTaxBps / 100}% creator tax
              </span>
            )}
          </div>

          <Link href={`/t/${t.address}`} className="group flex items-center gap-3">
            <TokenLogo
              symbol={t.symbol}
              address={t.address}
              src={t.imageUrl}
              size={38}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-medium text-ink transition-colors duration-100 group-hover:text-green">
                {t.name}
              </span>
              <span className="block truncate text-micro text-ink-3">
                {t.symbol}
              </span>
            </span>
          </Link>

          {t.description && (
            <p className="line-clamp-2 text-micro text-ink-2">{t.description}</p>
          )}

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-green"
              style={{ width: `${Math.max(t.progress * 100, 2)}%` }}
            />
          </div>

          <div className="flex items-baseline justify-between gap-3">
            {/* Denominated in whatever it paired against, not always ETH. It
                said "ETH raised" on a USDG token, which is the sort of wrong
                number somebody trades on. */}
            <span className="tnum text-micro text-ink-2">
              {t.raisedEth.toLocaleString("en-US", {
                maximumFractionDigits: 3,
              })}{" "}
              {quoteAsset(t.quote).symbol} raised
            </span>
            <span className="tnum text-micro text-ink-3">
              {Math.round(t.progress * 100)}%
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
}
