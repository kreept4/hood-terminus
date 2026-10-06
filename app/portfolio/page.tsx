import { Section } from "@/components/primitives/Section";
import { Reveal } from "@/components/primitives/Reveal";
import { ConnectedHoldings } from "@/components/wallets/ConnectedHoldings";

export const metadata = {
  title: "Portfolio",
  description: "What your wallet holds on Robinhood Chain.",
};

export default function PortfolioPage() {
  return (
    <Section title="Portfolio">
      <Reveal>
        <ConnectedHoldings />
      </Reveal>
    </Section>
  );
}
