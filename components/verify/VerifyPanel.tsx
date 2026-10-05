"use client";

import { clsx } from "@/lib/clsx";
import { ErrorPanel, SkeletonRows } from "@/components/primitives/States";
import type { Check, VerifyReport } from "@/lib/verify/types";
import { STATUS_TONE, STATUS_WORD, VERDICT_TONE, VERDICT_WORD } from "./tone";
import { useVerify } from "./useVerify";

/**
 * Verify, on the token page.
 *
 * Reads top to bottom the way a trader decides: the verdict, one sentence on
 * why, what a trade actually costs, then every check with what was observed.
 * The footer says plainly that this was a simulation and nothing was sent.
 */

function Mark({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-block whitespace-nowrap rounded-xs border px-1.5 py-[1px] text-micro uppercase tracking-wide",
        className,
      )}
    >
      {children}
    </span>
  );
}

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  return `${m} min ago`;
}

const pct = (n: number | null) => (n === null ? "n/a" : `${n < 10 ? n.toFixed(2) : n.toFixed(1)}%`);

function CostStrip({ report }: { report: VerifyReport }) {
  const sim = report.simulation;
  if (!sim || sim.sellBlocked) return null;
  const items = [
    { label: sim.tradeUsd ? `$${sim.tradeUsd.toFixed(0)} round trip` : "Round trip", value: pct(sim.roundTripPct) },
    { label: "Buy tax", value: pct(sim.buyTaxPct) },
    { label: "Sell tax", value: pct(sim.sellTaxPct) },
  ];
  return (
    <dl className="grid grid-cols-3 border-t border-line-soft">
      {items.map((item, i) => (
        <div key={item.label} className={clsx("px-4 py-3", i > 0 && "border-l border-line-soft")}>
          <dt className="text-micro text-ink-3">{item.label}</dt>
          <dd className="mt-0.5 text-body tabular-nums text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CheckRow({ check }: { check: Check }) {
  return (
    <li className="flex items-start gap-3 px-4 py-2.5">
      <Mark className={clsx("mt-[2px] w-[68px] text-center", STATUS_TONE[check.status])}>
        {STATUS_WORD[check.status]}
      </Mark>
      <div className="min-w-0">
        <div className="text-small text-ink">{check.label}</div>
        <div className="text-small text-ink-3">{check.detail}</div>
      </div>
    </li>
  );
}

export function VerifyPanel({ token, className }: { token: string; className?: string }) {
  const { data: report, error, isPending, isFetching, refetch } = useVerify(token);

  return (
    <section
      id="verify"
      aria-labelledby="verify-title"
      className={clsx("rounded-sm border border-line bg-surface", className)}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 id="verify-title" className="text-small text-ink-2">
            Verify
          </h2>
          {report && <Mark className={VERDICT_TONE[report.verdict]}>{VERDICT_WORD[report.verdict]}</Mark>}
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-micro text-ink-3 transition-colors duration-100 hover:text-ink disabled:hover:text-ink-3"
        >
          {isFetching ? "Checking" : report ? `Checked ${ago(report.checkedAt)}` : "Check"}
        </button>
      </header>

      {isPending ? (
        <SkeletonRows rows={6} height={44} />
      ) : error || !report ? (
        <ErrorPanel title={error instanceof Error ? error.message : "Verify could not run."} onRetry={() => refetch()} />
      ) : (
        <>
          <p className="px-4 pb-3 text-body text-ink">{report.headline}</p>
          <CostStrip report={report} />
          <ul className="divide-y divide-line-soft border-t border-line-soft">
            {report.checks.map((check) => (
              <CheckRow key={check.id} check={check} />
            ))}
          </ul>
          <footer className="border-t border-line-soft px-4 py-3 text-micro text-ink-3">
            {report.pool
              ? `Simulated against the live chain through ${report.pool.name}. Nothing was signed or sent.`
              : "No pool to simulate against."}{" "}
            Checks describe what the contracts allow today. Not financial advice.
          </footer>
        </>
      )}
    </section>
  );
}

/** Compact form for the trade panel: verdict and one line, linking to the full panel. */
export function VerifyBadge({ token, className }: { token: string; className?: string }) {
  const { data: report, isPending } = useVerify(token);
  if (isPending) {
    return <div className={clsx("text-micro text-ink-3", className)}>Checking this token</div>;
  }
  if (!report) return null;
  return (
    <a href="#verify" className={clsx("group flex items-center gap-2", className)}>
      <Mark className={VERDICT_TONE[report.verdict]}>{VERDICT_WORD[report.verdict]}</Mark>
      <span className="truncate text-micro text-ink-2 group-hover:text-ink">{report.headline}</span>
    </a>
  );
}
