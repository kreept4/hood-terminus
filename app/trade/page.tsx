import { Section } from "@/components/primitives/Section";
import { Reveal } from "@/components/primitives/Reveal";
import { TradePanel } from "@/components/trade/TradePanel";
import { Card } from "@/components/primitives/Card";
import {
  getTopPools,
  getNewPools,
  getPool,
  getTokenImages,
  isRoutable,
} from "@/lib/market/gecko";

export const metadata = {
  title: "Trade",
  description: "Swap tokens on Robinhood Chain.",
};

export const revalidate = 30;

export default async function TradePage({
  searchParams,
}: {
  searchParams: Promise<{ pool?: string }>;
}) {
  const [{ pool: asked }, top, fresh] = await Promise.all([
    searchParams,
    getTopPools(),
    getNewPools(),
  ]);

  // Two filters, both load-bearing.
  //
  // The chain carries at least eight exchanges and they do not share an
  // interface, so only Uniswap V3 and its forks can be quoted or routed here.
  // And only ETH-quoted pairs work through the router path this panel builds.
  //
  // Listing anything else produced exactly the bug it was meant to prevent: a
  // token you could select, size, and press Buy on, which then failed at the
  // quote with no explanation.
  const seen = new Set<string>();
  const pools = [...top, ...fresh]
    .filter((p) => {
      if (seen.has(p.address)) return false;
      seen.add(p.address);
      return (
        isRoutable(p) &&
        p.quoteSymbol === "WETH" &&
        (p.liquidityUsd ?? 0) > 1_000
      );
    })
    .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))
    .slice(0, 60);

  /**
   * A pool named in the link, so arriving from a token page opens on it.
   *
   * The list above is the sixty deepest markets, and a token page can be about
   * any of them, so a pair that qualifies perfectly well may simply not be in
   * it. That one is fetched and put first rather than the link quietly landing
   * on whatever happened to be at the top.
   *
   * The liquidity floor is deliberately not applied here. It exists to keep
   * dust out of a browsable list; somebody who followed a link to a specific
   * pair has already chosen it, and hiding it would look like the link was
   * broken. What is not waived is routability: a pool this panel cannot quote
   * would fail at the quote with no explanation, which is the bug the filter
   * exists to prevent, so a parameter naming one is ignored.
   */
  let selected = "";
  if (asked) {
    const wanted = asked.toLowerCase();
    const listed = pools.find((p) => p.address.toLowerCase() === wanted);
    if (listed) {
      selected = listed.address;
    } else {
      const fetched = await getPool(asked);
      if (fetched && isRoutable(fetched) && fetched.quoteSymbol === "WETH") {
        pools.unshift(fetched);
        selected = fetched.address;
      }
    }
  }

  const images = await getTokenImages(
    pools.map((p) => p.baseTokenAddress ?? "").filter(Boolean),
  );
  const logos = Object.fromEntries(images);

  return (
    <Section title="Trade">
      <Reveal>
        {pools.length === 0 ? (
          <Card className="px-5 py-12">
            <p className="text-center text-body text-ink-3">
              No ETH-quoted markets with enough liquidity to route right now.
            </p>
          </Card>
        ) : (
          <TradePanel pools={pools} logos={logos} selected={selected} />
        )}
      </Reveal>
    </Section>
  );
}
