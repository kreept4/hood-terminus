import { Section } from "@/components/primitives/Section";
import { Card } from "@/components/primitives/Card";
import { Reveal } from "@/components/primitives/Reveal";
import { WalletTracker } from "@/components/wallets/WalletTracker";
import { getTopWallets, getWalletPnl } from "@/lib/wallets/rankings";
import { WalletRankingTable } from "@/components/wallets/WalletRankingTable";
import { PnlBoard } from "@/components/wallets/PnlBoard";

export const metadata = {
  title: "Track wallets",
  description: "Follow wallets trading launches on Robinhood Chain.",
};

export const revalidate = 30;

export default async function WalletsPage() {
  const [wallets, scored] = await Promise.all([
    getTopWallets(),
    getWalletPnl({ limit: 100 }),
  ]);

  return (
    <Section title="Track wallets">
      <Reveal>
        <div className="flex flex-col gap-8">
          <WalletTracker />

          {/* The board people came for. Only rendered once the rollup has
              produced something, so an empty table never appears where a
              leaderboard is promised. */}
          {scored.length > 0 && (
            <div>
              <h2 className="mb-3 text-h3 font-semibold text-ink">
                Best performing
              </h2>
              <PnlBoard wallets={scored} />
            </div>
          )}

          {/* The ranked list, when there is one. It is a second way onto the
              same wallet pages rather than a replacement for the tracker, so
              it simply does not render until the ranking exists. */}
          {wallets.length > 0 && (
            <div>
              <h2 className="mb-3 text-h3 font-semibold text-ink">
                Most active
              </h2>
              <Card className="overflow-hidden">
                <WalletRankingTable wallets={wallets} />
              </Card>
            </div>
          )}
        </div>
      </Reveal>
    </Section>
  );
}
