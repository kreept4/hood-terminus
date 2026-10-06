import { Section } from "@/components/primitives/Section";
import { Reveal } from "@/components/primitives/Reveal";
import { TradePanel } from "@/components/trade/TradePanel";
import { Card } from "@/components/primitives/Card";
import {
  getTopPools,
  getNewPools,
  getTokenImages,
  isRoutable,
} from "@/lib/market/gecko";

export const metadata = {
  title: "Trade",
  description: "Swap tokens on Robinhood Chain.",
};

export const revalidate = 30;

export default async function TradePage() {
  const [top, fresh] = await Promise.all([getTopPools(), getNewPools()]);

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
          <TradePanel pools={pools} logos={logos} />
        )}
      </Reveal>
    </Section>
  );
}
