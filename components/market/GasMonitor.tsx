import { Card } from "@/components/primitives/Card";
import { getGas, getChainStatus } from "@/lib/chain/live";
import { NO_VALUE } from "@/lib/format";
import { clsx } from "@/lib/clsx";
import {
  IconGasCheap,
  IconGasNormal,
  IconGasBusy,
  IconGasHot,
} from "@/components/market/GasIcons";

export const revalidate = 5;

/**
 * Gas on Robinhood Chain.
 *
 * Gwei is the headline because that is the number traders quote at each other,
 * but the two figures beside it are the ones that answer the actual question.
 * Nobody converts gwei into the cost of a swap in their head, and on a chain
 * this cheap the interesting fact is precisely how cheap.
 *
 * Reads the chain directly rather than an indexer, so it is one of the few
 * things on the page that is true today.
 */
/**
 * The bands.
 *
 * Nobody knows whether 8 gwei is a lot without something to compare it to, so
 * the number is labelled. The thresholds are set against what this chain
 * actually does rather than against Ethereum mainnet, where these figures would
 * all read as free.
 */
function verdictFor(gwei: number | null) {
  if (gwei === null) return null;
  if (gwei < 5) {
    return {
      label: "Cheap",
      tone: "border-green-line bg-green-deep text-green",
      // Only the good state pulses. A page where every state moves has no
      // way left to say that one of them is worth acting on.
      pulse: true,
      Icon: IconGasCheap,
    };
  }
  if (gwei < 25) {
    return {
      label: "Normal",
      tone: "border-line text-ink-2",
      pulse: false,
      Icon: IconGasNormal,
    };
  }
  if (gwei < 100) {
    return {
      label: "Busy",
      tone: "border-line text-ink",
      pulse: false,
      Icon: IconGasBusy,
    };
  }
  return {
    label: "Expensive",
    tone: "border-red-line bg-red-deep text-red",
    pulse: true,
    Icon: IconGasHot,
  };
}

export async function GasMonitor() {
  const [gas, status] = await Promise.all([getGas(), getChainStatus()]);
  const verdict = verdictFor(gas.gwei);

  return (
    <Card className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <div className="flex items-baseline gap-3">
          <span className="tnum text-h3 leading-none font-semibold text-ink">
            {gas.gwei === null ? NO_VALUE : formatGwei(gas.gwei)}
          </span>
          <span className="text-body text-ink-3">gwei</span>
          {verdict && (
            <span
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-micro",
                verdict.tone,
                verdict.pulse && "gas-pulse",
              )}
            >
              <verdict.Icon />
              {verdict.label}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
          <Reading label="Send" value={eth(gas.transferEth)} />
          <Reading label="Swap" value={eth(gas.swapEth)} />
          <Reading
            label="Head block"
            value={status.headBlock?.toLocaleString() ?? NO_VALUE}
          />
        </div>
      </div>
    </Card>
  );
}

function Reading({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-micro text-ink-3">{label}</span>
      <span className="tnum text-body text-ink">{value}</span>
    </div>
  );
}

/** Gas on an L2 routinely sits below 0.01 gwei, where two decimals is zero. */
function formatGwei(v: number): string {
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.01) return v.toFixed(4);
  return v.toFixed(6);
}

function eth(v: number | null): string {
  if (v === null) return NO_VALUE;
  if (v >= 0.001) return `${v.toFixed(4)} ETH`;
  if (v >= 0.0000001) return `${v.toFixed(7)} ETH`;
  return "<0.0000001 ETH";
}
