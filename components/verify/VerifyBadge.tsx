"use client";

import Link from "next/link";
import { clsx } from "@/lib/clsx";
import { useVerify } from "./useVerify";
import { useAssistantName } from "@/lib/assistant";
import { VERDICT_TONE, VERDICT_WORD } from "./tone";
import type { VerifyReport } from "@/lib/verify/types";

/**
 * Verify's verdict, beside the thing it is a verdict about.
 *
 * The panel on the token page is for somebody deciding. This is for somebody
 * who has already decided and is about to sign, which is a different moment and
 * the last one where the answer still helps.
 *
 * It shares `useVerify` with the panel, so a token on screen in both places is
 * simulated once rather than twice.
 */
export function VerifyBadge({
  token,
  className,
}: {
  token: string | undefined;
  className?: string;
}) {
  const { data, isLoading, isError } = useVerify(token);
  const assistant = useAssistantName();

  if (!token) return null;

  if (isLoading) {
    return (
      <span className={clsx("text-micro text-ink-3", className)}>
        {assistant} is checking if you could sell it
      </span>
    );
  }

  /**
   * A failed check is reported, not hidden.
   *
   * Verify's whole contract is that a check which could not run says so rather
   * than passing. Rendering nothing here would quietly turn an unanswered
   * question into no question at all, at the exact moment it matters most.
   */
  if (isError || !data) {
    return (
      <span className={clsx("text-micro text-ink-3", className)}>
        {assistant} could not check this token
      </span>
    );
  }

  return (
    <Link
      href={`/verify?token=${token}`}
      className={clsx("inline-flex items-center gap-2", className)}
      title="See the full report"
    >
      <span
        className={clsx(
          "inline-block rounded-xs border px-1.5 py-[1px] text-micro tracking-wide uppercase",
          VERDICT_TONE[data.verdict],
        )}
      >
        {VERDICT_WORD[data.verdict]}
      </span>
      <span className="min-w-0 truncate text-micro text-ink-3">
        {data.headline}
      </span>
    </Link>
  );
}

/** Whether a verdict should stop somebody before they sign. */
export function needsConfirm(report: VerifyReport | undefined): boolean {
  return report?.verdict === "danger" || report?.verdict === "unknown";
}

/**
 * The gate between a bad verdict and a signature.
 *
 * It never blocks. Somebody who has read the finding and still wants the trade
 * is entitled to it, and a product that refuses would just be routed around.
 * What it does is make the decision deliberate: the verdict and the checks that
 * produced it, then two plainly different buttons.
 *
 * Cancel is the prominent one. That is the asymmetry of the situation rather
 * than an opinion about the token.
 */
export function VerifyConfirm({
  report,
  symbol,
  onCancel,
  onProceed,
}: {
  report: VerifyReport;
  symbol: string;
  onCancel: () => void;
  onProceed: () => void;
}) {
  const failing = report.checks.filter(
    (c) => c.status === "fail" || c.status === "unknown",
  );

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={`Verify says ${VERDICT_WORD[report.verdict]}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
    >
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-5">
        <span
          className={clsx(
            "inline-block rounded-xs border px-1.5 py-[1px] text-micro tracking-wide uppercase",
            VERDICT_TONE[report.verdict],
          )}
        >
          {VERDICT_WORD[report.verdict]}
        </span>

        <p className="mt-3 text-body text-ink">{report.headline}</p>

        {failing.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2 border-t border-line-soft pt-4">
            {failing.slice(0, 5).map((c) => (
              <li key={c.id} className="text-micro text-ink-2">
                <span className="text-ink">{c.label}.</span> {c.detail}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-md bg-green px-4 py-3 text-body font-semibold text-on-accent transition-opacity duration-100 hover:opacity-90"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onProceed}
            className="w-full rounded-md border border-line px-4 py-2.5 text-body text-ink-2 transition-colors duration-100 hover:border-red-line hover:text-red"
          >
            Buy anyway
          </button>
        </div>

        <p className="mt-3 text-center text-micro text-ink-3">
          Buying {symbol} is your decision. This is what we found.
        </p>
      </div>
    </div>
  );
}
