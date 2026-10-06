"use client";

import { useEffect, useState } from "react";
import { useAccount, useBalance, useReadContract, useWriteContract } from "wagmi";
import { formatEther, type Address } from "viem";
import { Card } from "@/components/primitives/Card";
import { DepositSheet, WithdrawSheet } from "@/components/wallet/FundingSheets";
import {
  LAUNCHPAD_ABI,
  LAUNCHPAD_ADDRESS,
  isLaunchpadDeployed,
} from "@/lib/launchpad";
import { robinhoodChain } from "@/lib/chain";
import { CURRENCIES, setCurrency, useCurrency, type Currency } from "@/lib/currency";
import { clsx } from "@/lib/clsx";

/**
 * The money bar at the top of the portfolio.
 *
 * Everything below it on this page answers "what am I holding". This answers
 * the three questions people actually arrive with: how much have I got, how do
 * I get more in, and how do I get it out.
 *
 * Earnings sit here rather than only on the create page. A creator's fees are
 * money they own, so the place they look for money is where it belongs, and
 * claiming is deliberately separate from withdrawing: the fees land in their
 * wallet, and what happens next, leave it to trade with or send it somewhere
 * else, is a second decision they get to make on its own.
 *
 * ETH is the large number. On a chain where everything is priced, paid and
 * earned in ETH, that is the figure someone acts on. The fiat line underneath
 * answers "is that a lot", which is a different question and a smaller one.
 */
export function FundingBar() {
  const { address } = useAccount();
  const { format, currency } = useCurrency();
  const [ethPriceUsd, setEthPriceUsd] = useState<number | null>(null);

  const [depositing, setDepositing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: balance, refetch: refetchBalance } = useBalance({
    address,
    chainId: robinhoodChain.id,
    query: { refetchInterval: 15_000 },
  });

  const { data: owed, refetch: refetchOwed } = useReadContract({
    address: LAUNCHPAD_ADDRESS as Address,
    abi: LAUNCHPAD_ABI,
    functionName: "feesOwed",
    // Native for now. A creator owed in USDG claims it on that token's page,
    // where the asset is unambiguous.
    args: address
      ? [address, "0x0000000000000000000000000000000000000000"]
      : undefined,
    query: { enabled: Boolean(address) && isLaunchpadDeployed() },
  });

  const { writeContractAsync } = useWriteContract();

  /**
   * The ETH price, from the same endpoint the holdings below already use.
   *
   * Read here rather than passed down so the page above stays a server
   * component and nothing else has to be rewired. The response is cached, so
   * the second caller costs nothing, and a missing price only blanks the
   * secondary line: the ETH figure never depends on it.
   */
  useEffect(() => {
    if (!address) return;
    let live = true;
    fetch(`/api/portfolio?address=${address}`)
      .then((r) => r.json())
      .then((p: { holdings?: { native: boolean; priceUsd: number | null }[] }) => {
        if (!live) return;
        const native = p.holdings?.find((h) => h.native);
        setEthPriceUsd(native?.priceUsd ?? null);
      })
      .catch(() => {
        // The fiat line reads "-". Nothing else is affected.
      });
    return () => {
      live = false;
    };
  }, [address]);

  const held = balance?.value ?? 0n;
  const earned = typeof owed === "bigint" ? owed : 0n;
  const heldEth = Number(formatEther(held));
  const earnedEth = Number(formatEther(earned));

  async function claim() {
    setClaiming(true);
    setError(null);
    try {
      await writeContractAsync({
        // Pinned. Without it wagmi builds the call for whatever chain the
        // wallet happens to be on, which sent a launchpad transaction to
        // Ethereum mainnet where the contract does not exist and the wallet
        // holds no gas. Naming the chain makes wagmi switch or fail loudly.
        chainId: robinhoodChain.id,
        address: LAUNCHPAD_ADDRESS as Address,
        abi: LAUNCHPAD_ABI,
        functionName: "withdrawFees",
        args: ["0x0000000000000000000000000000000000000000"],
      });
      await Promise.all([refetchOwed(), refetchBalance()]);
    } catch (e) {
      setError(
        e instanceof Error && /rejected|denied/i.test(e.message)
          ? "Cancelled in your wallet."
          : "Claiming failed. Your earnings stay credited to you.",
      );
    } finally {
      setClaiming(false);
    }
  }

  if (!address) return null;

  return (
    <>
      <Card className="mb-4 px-5 py-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <p className="tnum text-h2 leading-none font-bold tracking-tight text-ink">
              {heldEth.toFixed(5)}{" "}
              <span className="text-lead font-semibold text-ink-3">ETH</span>
            </p>
            <div className="mt-1.5 flex items-center gap-3">
              <p className="tnum text-body text-ink-3">
                {ethPriceUsd === null ? "-" : format(heldEth * ethPriceUsd)}
              </p>
              <CurrencyPicker current={currency} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDepositing(true)}
              className="rounded-md bg-green px-4 py-2.5 text-body font-semibold text-on-accent transition-opacity duration-100 hover:opacity-90"
            >
              Deposit
            </button>
            <button
              type="button"
              onClick={() => setWithdrawing(true)}
              disabled={held === 0n}
              className="rounded-md border border-line px-4 py-2.5 text-body font-medium text-ink transition-colors duration-100 hover:border-green hover:text-green disabled:opacity-50"
            >
              Withdraw
            </button>
          </div>
        </div>

        {/* Only when there is something to claim. The figure lives in the
            button, so the row needs no label above it explaining what the
            figure is. */}
        {earned > 0n && (
          <div className="mt-5 border-t border-line-soft pt-4">
            <button
              type="button"
              onClick={claim}
              disabled={claiming}
              className="rounded-md bg-green px-4 py-2.5 text-body font-semibold text-on-accent transition-opacity duration-100 hover:opacity-90 disabled:opacity-50"
            >
              {claiming
                ? "Claiming"
                : `Claim ${earnedEth.toFixed(5)} ETH earned`}
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-micro text-red">{error}</p>}
      </Card>

      {depositing && (
        <DepositSheet address={address} onClose={() => setDepositing(false)} />
      )}
      {withdrawing && <WithdrawSheet onClose={() => setWithdrawing(false)} />}
    </>
  );
}

/** Three letters, not a dropdown. There are only ever three of them. */
function CurrencyPicker({ current }: { current: Currency }) {
  return (
    <div className="flex items-center gap-0.5">
      {CURRENCIES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => setCurrency(c)}
          className={clsx(
            "rounded-sm px-1.5 py-0.5 text-micro transition-colors duration-100",
            c === current
              ? "bg-surface-2 text-ink"
              : "text-ink-3 hover:text-ink",
          )}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
