import Link from "next/link";
import { Card } from "@/components/primitives/Card";
import { TokenLogo } from "@/components/market/TokenLogo";
import { CurvePanel } from "@/components/create/CurvePanel";
import { ShareToken } from "@/components/create/ShareToken";
import { formatQuoteAmount, truncateAddress } from "@/lib/format";
import { quoteAsset } from "@/lib/launchpad/quotes";
import type { CurveToken } from "@/lib/launchpad/curve";

/**
 * A token that has not graduated.
 *
 * Deliberately not a stripped-down version of the pool page. There is no chart,
 * no depth and no trade history because none of those exist yet, and drawing
 * empty versions of them would suggest the data is missing rather than that the
 * token is early. What it does show is the one number that matters at this
 * stage: how far along the curve it is, and therefore how much buying is left
 * before it opens a real market.
 */
export function CurveTokenPage({ token }: { token: CurveToken }) {
  /**
   * Everything on this page is denominated in what the token is paired against,
   * which is not always ETH and is the whole point of the pairing. Reading a
   * native threshold against an NVDA balance told an NVDA token it was eleven
   * times further along than it was.
   */
  const asset = quoteAsset(token.quote);
  const remaining = Math.max(asset.graduation - token.raisedEth, 0);
  const percent = Math.round(token.progress * 100);


  return (
    <div className="gutter py-10 md:py-14">
      <div className="grid gap-5 lg:grid-cols-12">
        {/* ── The token ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5 lg:col-span-7">
          <div className="flex items-center gap-4">
            <TokenLogo
              symbol={token.symbol}
              address={token.address}
              src={token.imageUrl}
              size={56}
            />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-h1 leading-none font-bold tracking-tight text-ink">
                {token.name}
              </h1>
              <p className="mt-1 text-body text-ink-3">{token.symbol}</p>
            </div>
            <ShareToken symbol={token.symbol} percent={percent} />
          </div>

          {token.description && (
            <p className="max-w-xl text-lead text-ink-2">{token.description}</p>
          )}

          <Card className="flex flex-col gap-4 p-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-body font-medium text-ink">
                {percent}% of the way to a Uniswap market
              </span>
              <span className="tnum text-body text-ink-2">
                {formatQuoteAmount(token.raisedEth)} / {asset.graduation} {asset.symbol}
              </span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-green transition-[width] duration-300"
                style={{ width: `${Math.max(token.progress * 100, 2)}%` }}
              />
            </div>

            <p className="text-micro text-ink-3">
              {remaining > 0
                ? `Another ${formatQuoteAmount(remaining)} ${asset.symbol} of buying opens its pool. Until then it trades here and nowhere else.`
                : "The curve is full. Its market can be opened now."}
            </p>
          </Card>

          <Card className="p-5">
            <dl className="flex flex-col gap-3">
              <Row
                label="Price"
                value={
                  token.priceEth === null
                    ? "-"
                    : `${token.priceEth.toExponential(3)} ETH`
                }
              />
              <Row label="Raised" value={`${token.raisedEth.toFixed(4)} ETH`} />
              <Row
                label="Creator"
                value={truncateAddress(token.creator, 6)}
                href={`/w/${token.creator}`}
              />
              <Row label="Contract" value={truncateAddress(token.address, 6)} />
            </dl>
          </Card>
        </div>

        {/* ── Trading ───────────────────────────────────────────────── */}
        <div className="lg:col-span-5">
          <CurvePanel token={token} />
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-body text-ink-2">{label}</dt>
      <dd className="tnum text-body text-ink">
        {href ? (
          <Link href={href} className="transition-colors duration-100 hover:text-green">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
