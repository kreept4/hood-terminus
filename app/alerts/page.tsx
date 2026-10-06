import { Section } from "@/components/primitives/Section";
import { Reveal } from "@/components/primitives/Reveal";
import { AlertsPanel } from "@/components/alerts/AlertsPanel";
import { TrackedActivity } from "@/components/alerts/TrackedActivity";
import { getTopPools, getNewPools } from "@/lib/market/gecko";

export const metadata = {
  title: "Alerts",
  description: "Price and liquidity alerts on Robinhood Chain pools.",
};

export const revalidate = 30;

export default async function AlertsPage() {
  // Both populations, so a rule can be set on a new launch as well as on
  // something already trading. The picker is the whole tracked universe.
  const [top, fresh] = await Promise.all([getTopPools(), getNewPools()]);

  const seen = new Set<string>();
  const pools = [...top, ...fresh].filter((p) => {
    if (seen.has(p.address)) return false;
    seen.add(p.address);
    return true;
  });

  return (
    <Section title="Alerts">
      <Reveal>
        <AlertsPanel pools={pools} />

        <div className="mt-10">
          <TrackedActivity />
        </div>
      </Reveal>
    </Section>
  );
}
