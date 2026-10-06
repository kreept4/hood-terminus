"use client";

import { useEffect, useState } from "react";
import { parseUnits, formatUnits, type Address } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { Card } from "@/components/primitives/Card";
import { clsx } from "@/lib/clsx";
import { robinhoodChain } from "@/lib/chain";
import { LAUNCHPAD_ABI, LAUNCHPAD_ADDRESS } from "@/lib/launchpad";
import { NATIVE, quoteAsset } from "@/lib/launchpad/quotes";
import type { CurveToken } from "@/lib/launchpad/curve";

/**
 * Buying and selling a token that has no pool yet.
 *
 * The ordinary trade panel routes through Uniswap, which cannot touch these:
 * there is no pool to route through until the curve fills. So this talks to the
 * launchpad directly, and it is the only way a curve token can be traded
 * anywhere. Without it the curve board is a list of things you can look at and
 * not buy, and nothing ever reaches the graduation threshold.
 *
 * Quotes come from the same functions the contract prices the trade with, so
 * the number shown is the number that executes, minus whatever moves between
 * blocks. Slippage is held at one percent against that.
 */

const SLIPPAGE_BPS = 100n;

const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export function CurvePanel({ token }: { token: CurveToken }) {
  const { address, isConnected } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<bigint | null>(null);
  const [balance, setBalance] = useState<bigint>(0n);
  const [busy, setBusy] = useState(false);
  /**
   * Which signature the wallet is currently asking for.
   *
   * An ERC20 pairing needs two: an allowance, then the buy. Without naming
   * them, a second wallet popup after the first was approved reads as the
   * first one having failed, and people reject it.
   */
  const [step, setStep] = useState<"approving" | "buying" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // What this wallet holds, so the sell side can offer a Max.
  useEffect(() => {
    if (!client || !address) return;
    void client
      .readContract({
        address: token.address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
      })
      .then((b) => setBalance(b as bigint))
      .catch(() => setBalance(0n));
  }, [client, address, token.address, done]);

  // Quoted as the amount is typed, debounced. A price that only appears after
  // you commit is not a price.
  useEffect(() => {
    if (!client || !amount || Number(amount) <= 0) {
      setQuote(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        // Same units as the trade itself, or the quote describes a different
        // transaction from the one the button sends.
        const raw = parseUnits(amount, quoteAsset(token.quote).decimals);
        const result = await client.readContract({
          address: LAUNCHPAD_ADDRESS as Address,
          abi: LAUNCHPAD_ABI,
          functionName: side === "buy" ? "quoteBuy" : "quoteSell",
          args: [token.address, raw],
        });
        setQuote(result as bigint);
      } catch {
        setQuote(null);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [client, amount, side, token.address, token.quote]);

  async function submit() {
    if (!client || !address || quote === null) return;
    setBusy(true);
    setStep(null);
    setError(null);
    setDone(false);

    try {
      const asset = quoteAsset(token.quote);
      /**
       * Parsed in the pairing's own units, not always eighteen.
       *
       * USDG has six. `parseEther("10")` against it would send ten trillion
       * units, which is not a slippage failure or a rejected transaction, it is
       * a wallet spending everything it holds on one buy.
       */
      const raw = parseUnits(amount, asset.decimals);
      const minOut = (quote * (10_000n - SLIPPAGE_BPS)) / 10_000n;

      if (side === "buy") {
        if (token.quote === NATIVE) {
          const hash = await writeContractAsync({
            // Pinned. Without it wagmi builds the call for whatever chain the
            // wallet happens to be on, which sent a launchpad transaction to
            // Ethereum mainnet where the contract does not exist and the
            // wallet holds no gas.
            chainId: robinhoodChain.id,
            address: LAUNCHPAD_ADDRESS as Address,
            abi: LAUNCHPAD_ABI,
            functionName: "buy",
            args: [token.address, minOut],
            value: raw,
          });
          await client.waitForTransactionReceipt({ hash });
        } else {
          /**
           * An ERC20 pairing is pulled, not sent, so it needs an allowance.
           *
           * Checked before asking. A second signature for an allowance that
           * already exists is how people abandon a trade halfway.
           */
          const allowance = (await client.readContract({
            address: token.quote,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [address, LAUNCHPAD_ADDRESS as Address],
          })) as bigint;

          if (allowance < raw) {
            setStep("approving");
            const approval = await writeContractAsync({
              chainId: robinhoodChain.id,
              address: token.quote,
              abi: ERC20_ABI,
              functionName: "approve",
              args: [LAUNCHPAD_ADDRESS as Address, raw],
            });
            await client.waitForTransactionReceipt({ hash: approval });
          }

          setStep("buying");
          const hash = await writeContractAsync({
            chainId: robinhoodChain.id,
            address: LAUNCHPAD_ADDRESS as Address,
            abi: LAUNCHPAD_ABI,
            functionName: "buyWithQuote",
            args: [token.address, raw, minOut],
          });
          await client.waitForTransactionReceipt({ hash });
        }
      } else {
        // The launchpad pulls the tokens with transferFrom, so it needs an
        // allowance first. Checked rather than always sent: a second signature
        // for nothing is how people abandon a trade.
        const allowance = (await client.readContract({
          address: token.address,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [address, LAUNCHPAD_ADDRESS as Address],
        })) as bigint;

        if (allowance < raw) {
          const approval = await writeContractAsync({
            chainId: robinhoodChain.id,
            address: token.address,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [LAUNCHPAD_ADDRESS as Address, raw],
          });
          await client.waitForTransactionReceipt({ hash: approval });
        }

        const hash = await writeContractAsync({
          chainId: robinhoodChain.id,
          address: LAUNCHPAD_ADDRESS as Address,
          abi: LAUNCHPAD_ABI,
          functionName: "sell",
          args: [token.address, raw, minOut],
        });
        await client.waitForTransactionReceipt({ hash });
      }

      setDone(true);
      setAmount("");
      setQuote(null);
    } catch (e) {
      const text = e instanceof Error ? e.message.toLowerCase() : "";
      setError(
        text.includes("rejected") || text.includes("denied")
          ? "You rejected the transaction."
          : text.includes("slippage")
            ? "The price moved. Try again."
            : text.includes("insufficient")
              ? "Not enough balance for that."
              : "The trade did not go through. Nothing was spent.",
      );
    } finally {
      setBusy(false);
      setStep(null);
    }
  }

  const received =
    quote === null
      ? "-"
      : side === "buy"
        ? Number(formatUnits(quote, 18)).toLocaleString("en-US", {
            maximumFractionDigits: 0,
          }) +
          " " +
          token.symbol
        : Number(formatUnits(quote, quoteAsset(token.quote).decimals)).toFixed(5) +
          " " +
          quoteAsset(token.quote).symbol;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center rounded-md border border-line-soft bg-surface-2 p-0.5">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setSide(s);
              setAmount("");
              setQuote(null);
              setError(null);
            }}
            aria-pressed={side === s}
            className={clsx(
              "flex-1 rounded-sm px-3 py-2 text-body font-medium capitalize transition-colors duration-100",
              side === s
                ? s === "buy"
                  ? "bg-green text-on-accent"
                  : "bg-surface text-ink"
                : "text-ink-3 hover:text-ink",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <span className="flex items-baseline justify-between gap-3">
          <label htmlFor="curve-amount" className="text-body text-ink-2">
            {side === "buy" ? "You pay" : "You sell"}
          </label>
          {side === "sell" && balance > 0n && (
            <button
              type="button"
              onClick={() => setAmount(formatUnits(balance, 18))}
              className="text-micro text-green hover:underline"
            >
              Max
            </button>
          )}
        </span>

        <div className="relative">
          <input
            id="curve-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            placeholder="0.0"
            className="tnum w-full rounded-md border border-line bg-surface-2 px-3 py-3 pr-16 text-lead text-ink placeholder:text-ink-3 focus:border-green focus:outline-none"
          />
          <span className="absolute inset-y-0 right-3 flex items-center text-body text-ink-3">
            {side === "buy" ? "ETH" : token.symbol}
          </span>
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-3 border-t border-line-soft pt-3">
        <span className="text-body text-ink-2">You receive</span>
        <span className="tnum text-body font-medium text-ink">{received}</span>
      </div>

      {error && <p className="text-micro text-red">{error}</p>}
      {done && !error && <p className="text-micro text-green">Done.</p>}

      <button
        type="button"
        disabled={!isConnected || busy || quote === null}
        onClick={submit}
        className="rounded-md bg-green px-4 py-3 text-body font-semibold text-on-accent transition-opacity duration-100 hover:opacity-90 disabled:opacity-50"
      >
        {!isConnected
          ? "Sign in"
          : step === "approving"
            ? `Approve ${quoteAsset(token.quote).symbol}`
            : busy
              ? "Confirming"
              : side === "buy"
                ? "Buy"
                : "Sell"}
      </button>

      <p className="text-micro text-ink-3">
        Traded against the curve, not a pool. At{" "}
        {quoteAsset(token.quote).graduation} {quoteAsset(token.quote).symbol} it
        opens a Uniswap market and trades everywhere.
      </p>
    </Card>
  );
}
