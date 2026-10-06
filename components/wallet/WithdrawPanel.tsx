"use client";

import { useState } from "react";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useSendTransaction,
} from "wagmi";
import { formatEther, isAddress, parseEther, type Address } from "viem";
import { robinhoodChain } from "@/lib/chain";
import { clsx } from "@/lib/clsx";

/**
 * Getting money back out.
 *
 * The counterpart to the deposit panel, and the more important half of it. A
 * wallet you can put money into and not take money out of is not a wallet, and
 * an embedded wallet makes that sharper: it was created by signing in with an
 * email, so there is no MetaMask to open and do it from instead. Without this
 * screen, funds that arrive here have no way out.
 *
 * Native ETH only, on purpose. Withdrawing a token means an ERC-20 transfer and
 * a token picker, and a curve token cannot be sold anywhere but this site
 * anyway, so the thing worth moving is the gas token. Sell the position, then
 * withdraw the proceeds.
 *
 * Three things this has to get right, because each one loses somebody's money:
 * an address that is real, an amount that leaves enough behind for gas, and no
 * ambiguity about the fact that it cannot be undone.
 */
export function WithdrawPanel({ onDone }: { onDone: () => void }) {
  const { address } = useAccount();
  const client = usePublicClient();
  const { sendTransactionAsync, isPending } = useSendTransaction();

  const { data: balance } = useBalance({
    address,
    chainId: robinhoodChain.id,
    query: { refetchInterval: 10_000 },
  });

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [maxing, setMaxing] = useState(false);
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const held = balance?.value ?? 0n;
  const destination = to.trim();
  const destinationValid = isAddress(destination);

  let wanted: bigint | null = null;
  try {
    wanted = amount.trim() === "" ? null : parseEther(amount.trim());
  } catch {
    wanted = null;
  }

  const overBalance = wanted !== null && wanted > held;
  const ready =
    destinationValid &&
    wanted !== null &&
    wanted > 0n &&
    !overBalance &&
    !isPending;

  /**
   * Fills in what can actually leave, which is never the whole balance.
   *
   * Sending everything always fails: the transfer itself costs gas and the node
   * reserves that up front. So the fee is estimated against this exact transfer
   * and held back, with half again on top, because the block it lands in is not
   * the block it was priced in.
   */
  async function fillMax() {
    if (!client || !address || !destinationValid || held === 0n) return;
    setMaxing(true);
    setError(null);
    try {
      const [gas, fees] = await Promise.all([
        client.estimateGas({
          account: address,
          to: destination as Address,
          value: 1n,
        }),
        client.estimateFeesPerGas(),
      ]);
      const reserve = (gas * fees.maxFeePerGas * 3n) / 2n;
      const sendable = held > reserve ? held - reserve : 0n;
      if (sendable === 0n) {
        setError("There is not enough here to cover the network fee.");
        return;
      }
      setAmount(formatEther(sendable));
    } catch {
      setError("Could not price the network fee. Type an amount instead.");
    } finally {
      setMaxing(false);
    }
  }

  async function send() {
    if (!ready || wanted === null) return;
    setError(null);
    try {
      const sent = await sendTransactionAsync({
        to: destination as Address,
        value: wanted,
        chainId: robinhoodChain.id,
      });
      setHash(sent);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(
        // A rejection in the wallet is a decision, not a failure.
        /denied|rejected/i.test(message)
          ? "Cancelled in your wallet."
          : "The transfer did not go through. Your balance is unchanged.",
      );
    }
  }

  if (hash) {
    return (
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <p className="text-lead font-semibold text-green">Sent</p>
        <p className="text-body text-ink-2">
          {amount} ETH is on its way to{" "}
          <span className="tnum break-all text-ink">{destination}</span>.
        </p>
        <a
          href={`${robinhoodChain.blockExplorers.default.url}/tx/${hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-micro text-ink-3 underline transition-colors duration-100 hover:text-green"
        >
          View on explorer
        </a>
        <button
          type="button"
          onClick={onDone}
          className="mt-1 w-full rounded-md bg-green px-4 py-2.5 text-body font-semibold text-on-accent transition-opacity duration-100 hover:opacity-90"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <input
          aria-label="Destination address"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Destination address"
          spellCheck={false}
          autoComplete="off"
          className={clsx(
            "tnum w-full rounded-md border bg-surface-2 px-3 py-2.5 text-body text-ink",
            "placeholder:text-ink-3 focus:outline-none",
            destination !== "" && !destinationValid
              ? "border-red-line focus:border-red"
              : "border-line focus:border-green",
          )}
        />
        {destination !== "" && !destinationValid && (
          <p className="mt-1.5 text-micro text-red">Not a valid address.</p>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2">
          <input
            aria-label="Amount in ETH"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Amount in ETH, ${Number(formatEther(held)).toFixed(5)} available`}
            inputMode="decimal"
            spellCheck={false}
            className={clsx(
              "tnum min-w-0 flex-1 rounded-md border bg-surface-2 px-3 py-2.5 text-body text-ink",
              "placeholder:text-ink-3 focus:outline-none",
              overBalance
                ? "border-red-line focus:border-red"
                : "border-line focus:border-green",
            )}
          />
          <button
            type="button"
            onClick={fillMax}
            disabled={!destinationValid || maxing || held === 0n}
            className="shrink-0 rounded-md border border-line px-3 py-2.5 text-micro text-ink-2 transition-colors duration-100 hover:border-green hover:text-green disabled:opacity-50"
          >
            {maxing ? "Pricing" : "Max"}
          </button>
        </div>
        {overBalance && (
          <p className="mt-1.5 text-micro text-red">
            More than this wallet holds.
          </p>
        )}
      </div>

      {error && <p className="text-micro text-red">{error}</p>}

      <button
        type="button"
        onClick={send}
        disabled={!ready}
        className="w-full rounded-md bg-green px-4 py-3 text-body font-semibold text-on-accent transition-opacity duration-100 hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Confirm in your wallet" : "Withdraw"}
      </button>

      {/* Kept deliberately, and cut to one line. Everything else here was
          explanatory padding, but a transfer that cannot be undone is the one
          thing a person needs told before they press the button. */}
      <p className="text-micro text-ink-3">
        Sends on {robinhoodChain.name}. Cannot be reversed.
      </p>
    </div>
  );
}
