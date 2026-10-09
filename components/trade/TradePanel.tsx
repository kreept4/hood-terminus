"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";
import { Card } from "@/components/primitives/Card";
import { ConnectWallet } from "@/components/wallet/ConnectWallet";
import { TokenLogo } from "@/components/market/TokenLogo";
import { TokenSelect } from "@/components/trade/TokenSelect";
import { clsx } from "@/lib/clsx";
import { robinhoodChain } from "@/lib/chain";
import { CONTRACTS } from "@/lib/chain/contracts";
import {
  applySlippage,
  buildBuy,
  buildSell,
  ERC20_ABI,
  PERMIT2_ABI,
  UNIVERSAL_ROUTER_ABI,
} from "@/lib/trade/router";
import type { Pool } from "@/lib/market/gecko";
import { useVerify } from "@/components/verify/useVerify";
import {
  VerifyBadge,
  VerifyConfirm,
  needsConfirm,
} from "@/components/verify/VerifyBadge";

/**
 * The trade panel.
 *
 * Buy and sell are a direction, not a magnitude, so they are two buttons rather
 * than a slider. The slider belongs on the amount, where the value really is
 * continuous, and that is what the percentage row is.
 *
 * Quotes come from `/api/quote`, which computes them off pool state. They are
 * debounced: quoting on every keystroke would be one RPC round trip per
 * character typed.
 *
 * The number that protects the trader is `minimum received`, not the quote. It
 * is derived from the quote and the slippage setting and enforced on chain, so
 * an optimistic quote makes a swap revert rather than makes someone lose money.
 */

const SLIPPAGE_PRESETS = [0.5, 1, 3, 5];
const PERCENTAGES = [25, 50, 75, 100];

type Side = "buy" | "sell";

type QuoteResponse = {
  pool: string;
  token0: string;
  token1: string;
  fee: number;
  quote: {
    amountIn: string;
    amountOut: string;
    priceImpactPct: number;
    feePct: number;
    beyondRange: boolean;
  } | null;
};

export function TradePanel({
  pools,
  logos,
}: {
  pools: Pool[];
  logos: Record<string, string>;
}) {
  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const publicClient = usePublicClient();
  const [simulating, setSimulating] = useState(false);

  const [poolAddress, setPoolAddress] = useState(pools[0]?.address ?? "");
  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(1);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pool = useMemo(
    () => pools.find((p) => p.address === poolAddress) ?? null,
    [pools, poolAddress],
  );

  const token = (pool?.baseTokenAddress ?? "") as Address;
  const weth = CONTRACTS.weth as Address;

  // ── Balances ─────────────────────────────────────────────────────────────
  const { data: nativeBalance } = useBalance({ address });

  const { data: tokenDecimals } = useReadContract({
    address: token || undefined,
    abi: ERC20_ABI,
    functionName: "decimals",
    query: { enabled: Boolean(token) },
  });

  const { data: tokenBalance } = useReadContract({
    address: token || undefined,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(token && address) },
  });

  const decimalsIn = side === "buy" ? 18 : (tokenDecimals ?? 18);
  const decimalsOut = side === "buy" ? (tokenDecimals ?? 18) : 18;
  const symbolIn = side === "buy" ? "ETH" : (pool?.symbol ?? "");
  const symbolOut = side === "buy" ? (pool?.symbol ?? "") : "ETH";

  const balanceIn =
    side === "buy" ? nativeBalance?.value : (tokenBalance as bigint | undefined);

  // ── Quoting ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pool || !amount || Number(amount) <= 0) {
      setQuote(null);
      setError(null);
      return;
    }

    let live = true;
    setQuoting(true);

    // Debounced. Quoting per keystroke is one round trip per character.
    const timer = setTimeout(async () => {
      try {
        const raw = parseUnits(amount, decimalsIn);
        const tokenIn = side === "buy" ? weth : token;
        const res = await fetch(
          `/api/quote?pool=${pool.address}&tokenIn=${tokenIn}&amount=${raw}`,
        );
        if (!live) return;
        if (!res.ok) {
          setQuote(null);
          setError("No quote available for this size.");
          return;
        }
        setQuote((await res.json()) as QuoteResponse);
        setError(null);
      } catch {
        if (live) {
          setQuote(null);
          setError("Could not reach the chain.");
        }
      } finally {
        if (live) setQuoting(false);
      }
    }, 350);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [pool, amount, side, decimalsIn, token, weth]);

  const amountOut = quote?.quote ? BigInt(quote.quote.amountOut) : 0n;
  const minReceived = amountOut > 0n ? applySlippage(amountOut, slippage) : 0n;

  const setPercent = useCallback(
    (pct: number) => {
      if (!balanceIn) return;
      // Never the whole ETH balance: the transaction still has to pay gas out
      // of it, so a MAX that spends everything is a MAX that always fails.
      const usable =
        side === "buy" && pct === 100
          ? (balanceIn * 99n) / 100n
          : (balanceIn * BigInt(pct)) / 100n;
      setAmount(formatUnits(usable, decimalsIn));
    },
    [balanceIn, decimalsIn, side],
  );

  // ── Verify ───────────────────────────────────────────────────────────────
  /**
   * The verdict for the token being bought, and the gate in front of a bad one.
   *
   * Only on a buy. Selling a token Verify dislikes is the thing somebody should
   * be doing, and stopping to warn them about it would be absurd.
   */
  const { data: verifyReport } = useVerify(
    side === "buy" ? (pool?.baseTokenAddress ?? undefined) : undefined,
  );
  const [confirming, setConfirming] = useState(false);

  // ── Execution ────────────────────────────────────────────────────────────
  /**
   * Checks the verdict, then either asks or proceeds.
   *
   * Split from `execute` so "Buy anyway" can call the second half directly
   * without coming back through the gate it just passed.
   */
  function submit() {
    if (side === "buy" && needsConfirm(verifyReport)) {
      setConfirming(true);
      return;
    }
    void execute();
  }

  async function execute() {
    if (!pool || !quote?.quote || !address) return;
    setError(null);

    try {
      const raw = parseUnits(amount, decimalsIn);
      const call =
        side === "buy"
          ? buildBuy({ token, fee: quote.fee, amountIn: raw, minAmountOut: minReceived })
          : buildSell({ token, fee: quote.fee, amountIn: raw, minAmountOut: minReceived });

      // Selling pulls an ERC-20 through Permit2, which needs two allowances in
      // place first. Buying wraps the transaction's own ETH and needs neither.
      if (side === "sell") {
        await writeContractAsync({
          // Pinned. Without it wagmi builds the call for whatever chain the
          // wallet happens to be on, which sent a launchpad transaction to
          // Ethereum mainnet where the contract does not exist and the wallet
          // holds no gas. Naming the chain makes wagmi switch or fail loudly.
          chainId: robinhoodChain.id,
          address: token,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [CONTRACTS.permit2 as Address, raw],
        });
        await writeContractAsync({
          chainId: robinhoodChain.id,
          address: CONTRACTS.permit2 as Address,
          abi: PERMIT2_ABI,
          functionName: "approve",
          args: [
            token,
            CONTRACTS.universalRouter as Address,
            raw,
            Math.floor(Date.now() / 1000) + 3600,
          ],
        });
      }

      // Simulate before prompting.
      //
      // A swap that reverts on chain costs gas and explains nothing: the wallet
      // reports a failed transaction and the trader is left guessing. Running
      // the identical call as `eth_call` first turns that into a message before
      // anything is signed, and it is the only way to catch a router whose
      // command encoding differs from what this was built against.
      //
      // This is not a nicety. The UniversalRouter deployed here is v2, not the
      // v1.2 these commands were written for, so the assumption is worth
      // checking on every single trade rather than trusting once.
      if (!publicClient) throw new Error("No chain connection.");

      setSimulating(true);
      try {
        await publicClient.simulateContract({
          account: address,
          address: call.to,
          abi: UNIVERSAL_ROUTER_ABI,
          functionName: "execute",
          args: [call.commands, call.inputs, call.deadline],
          value: call.value,
        });
      } finally {
        setSimulating(false);
      }

      await writeContractAsync({
        chainId: robinhoodChain.id,
        address: call.to,
        abi: UNIVERSAL_ROUTER_ABI,
        functionName: "execute",
        args: [call.commands, call.inputs, call.deadline],
        value: call.value,
      });

      setAmount("");
      setQuote(null);
    } catch (e) {
      setError(readableError(e));
    }
  }

  const overBalance =
    balanceIn !== undefined &&
    amount !== "" &&
    (() => {
      try {
        return parseUnits(amount, decimalsIn) > balanceIn;
      } catch {
        return false;
      }
    })();

  const busy = isPending || simulating;
  const ready =
    isConnected && Boolean(quote?.quote) && !overBalance && Number(amount) > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
      <Card className="p-5 lg:col-span-5">
        {/* ── Direction ───────────────────────────────────────────────── */}
        <div className="flex rounded-md border border-line-soft bg-surface-2 p-0.5">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSide(s);
                setAmount("");
              }}
              aria-pressed={side === s}
              className={clsx(
                "flex-1 rounded-sm py-2 text-body font-medium capitalize transition-colors duration-100",
                side === s
                  ? s === "buy"
                    ? "bg-green text-on-accent"
                    : "bg-red text-ink"
                  : "text-ink-3 hover:text-ink",
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* ── Token ───────────────────────────────────────────────────── */}
        <div className="mt-5 flex flex-col gap-2">
          <span className="text-body font-medium text-ink">Token</span>
          <TokenSelect
            pools={pools}
            logos={logos}
            value={poolAddress}
            onChange={(next) => {
              setPoolAddress(next);
              setAmount("");
            }}
          />
        </div>

        {/* ── Balances ────────────────────────────────────────────────── */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <BalanceTile
            label="ETH"
            amount={nativeBalance?.value}
            decimals={18}
            active={side === "buy"}
          />
          <BalanceTile
            label={pool?.symbol ?? "Token"}
            amount={tokenBalance as bigint | undefined}
            decimals={tokenDecimals ?? 18}
            active={side === "sell"}
            logo={
              pool ? (
                <TokenLogo
                  symbol={pool.symbol}
                  address={pool.baseTokenAddress ?? pool.address}
                  src={logos[pool.baseTokenAddress?.toLowerCase() ?? ""]}
                  size={18}
                />
              ) : undefined
            }
          />
        </div>

        {/* ── Amount ──────────────────────────────────────────────────── */}
        <label className="mt-4 flex flex-col gap-2">
          <span className="text-body font-medium text-ink">You pay</span>
          <div className="relative">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="0"
              className={clsx(INPUT, "tnum pr-20 text-lead")}
            />
            <span className="tnum absolute inset-y-0 right-3 flex items-center text-body text-ink-3">
              {symbolIn}
            </span>
          </div>
        </label>

        {/* The slider that actually makes sense: amount, not direction. */}
        <div className="mt-2.5 grid grid-cols-4 gap-1.5">
          {PERCENTAGES.map((pct) => (
            <button
              key={pct}
              type="button"
              disabled={!balanceIn}
              onClick={() => setPercent(pct)}
              className="tnum flex min-h-10 items-center justify-center rounded-md border border-line py-1.5 text-micro text-ink-2 transition-colors duration-100 hover:border-green hover:text-green disabled:opacity-40"
            >
              {pct === 100 ? "Max" : `${pct}%`}
            </button>
          ))}
        </div>

        {/* ── Slippage ────────────────────────────────────────────────── */}
        <div className="mt-5">
          <span className="text-body font-medium text-ink">Slippage</span>
          <div className="mt-2 flex gap-1.5">
            {SLIPPAGE_PRESETS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSlippage(s)}
                aria-pressed={slippage === s}
                className={clsx(
                  "tnum flex-1 rounded-md border py-1.5 text-micro transition-colors duration-100",
                  slippage === s
                    ? "border-green bg-green-deep text-green"
                    : "border-line text-ink-2 hover:text-ink",
                )}
              >
                {s}%
              </button>
            ))}
          </div>
        </div>

        {/* The verdict, beside the button that acts on it. Buys only: nobody
            needs warning off selling a token Verify dislikes. */}
        {side === "buy" && pool?.baseTokenAddress && (
          <div className="mt-4 border-t border-line-soft pt-4">
            <VerifyBadge token={pool.baseTokenAddress} />
          </div>
        )}

        <div className="mt-5">
          {isConnected ? (
            <button
              type="button"
              onClick={submit}
              disabled={!ready || busy}
              className={clsx(
                "w-full rounded-md px-4 py-3 text-body font-semibold transition-opacity duration-100",
                ready && !busy
                  ? side === "buy"
                    ? "bg-green text-on-accent hover:opacity-90"
                    : "bg-red text-ink hover:opacity-90"
                  : "border border-line text-ink-3",
              )}
            >
              {simulating
                ? "Checking the trade"
                : isPending
                ? "Confirm in your wallet"
                : overBalance
                  ? `Not enough ${symbolIn}`
                  : !amount
                    ? "Enter an amount"
                    : !quote?.quote
                      ? "No quote"
                      : `${side === "buy" ? "Buy" : "Sell"} ${pool?.symbol ?? ""}`}
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <ConnectWallet
                className="w-full justify-center py-3"

                label="Sign in"
              />
              <ConnectWallet
                className="w-full justify-center py-3"

                label="Link a wallet"
              />
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-micro text-red">{error}</p>}
      </Card>

      {/* ── Receipt ───────────────────────────────────────────────────── */}
      <Card className="p-5 lg:col-span-7">
        <div className="flex items-center gap-3">
          {pool && (
            <TokenLogo
              symbol={pool.symbol}
              address={pool.baseTokenAddress ?? pool.address}
              src={logos[pool.baseTokenAddress?.toLowerCase() ?? ""]}
              size={34}
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-lead font-semibold text-ink">
              {pool ? `${pool.symbol} / ${pool.quoteSymbol}` : "No token"}
            </p>
            <p className="tnum text-micro text-ink-3">
              {quote ? `${(quote.fee / 10_000).toFixed(2)}% pool fee` : "—"}
            </p>
          </div>
        </div>

        <dl className="mt-5 flex flex-col gap-3 border-t border-line-soft pt-5">
          <Row
            label="You receive"
            value={
              quoting
                ? "Quoting"
                : amountOut > 0n
                  ? `${Number(formatUnits(amountOut, decimalsOut)).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${symbolOut}`
                  : "—"
            }
            strong
          />
          <Row
            label="Minimum received"
            value={
              minReceived > 0n
                ? `${Number(formatUnits(minReceived, decimalsOut)).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${symbolOut}`
                : "—"
            }
          />
          <Row
            label="Price impact"
            value={
              quote?.quote
                ? `${quote.quote.priceImpactPct.toFixed(3)}%`
                : "—"
            }
            tone={
              quote?.quote && Math.abs(quote.quote.priceImpactPct) > 3
                ? "warn"
                : undefined
            }
          />
          <Row label="Slippage" value={`${slippage}%`} />
          <Row label="Route" value={pool ? `${symbolIn} → ${symbolOut}` : "—"} />
        </dl>

        {quote?.quote?.beyondRange && (
          <p className="mt-4 border-t border-line-soft pt-4 text-micro text-ink-3">
            This size moves the price past the pool&apos;s current range, so the
            real output will be lower than quoted. The minimum received above is
            enforced on chain, so the trade reverts rather than filling worse.
          </p>
        )}

      </Card>

      {confirming && verifyReport && (
        <VerifyConfirm
          report={verifyReport}
          symbol={pool?.symbol ?? "this token"}
          onCancel={() => setConfirming(false)}
          onProceed={() => {
            setConfirming(false);
            void execute();
          }}
        />
      )}
    </div>
  );
}

const INPUT =
  "w-full rounded-md border border-line bg-surface-2 px-3 py-2.5 text-body text-ink " +
  "placeholder:text-ink-3 focus:border-green focus:outline-none";

function Row({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "warn";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-body text-ink-3">{label}</dt>
      <dd
        className={clsx(
          "tnum truncate",
          strong ? "text-lead font-semibold text-ink" : "text-body",
          tone === "warn" ? "text-red" : !strong && "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * One side's balance.
 *
 * Both are always on screen, and the one being spent is lit. Showing only the
 * input balance means flipping the direction to find out whether you hold
 * enough of the other thing to flip the direction.
 */
function BalanceTile({
  label,
  amount,
  decimals,
  active,
  logo,
}: {
  label: string;
  amount: bigint | undefined;
  decimals: number;
  active: boolean;
  logo?: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        "rounded-md border px-3 py-2.5 transition-colors duration-150",
        active ? "border-green bg-green-deep" : "border-line-soft bg-surface-2",
      )}
    >
      <span className="flex items-center gap-1.5">
        {logo}
        <span
          className={clsx(
            "truncate text-micro",
            active ? "text-green" : "text-ink-3",
          )}
        >
          {label}
        </span>
      </span>
      <span className="tnum mt-1 block truncate text-body text-ink">
        {amount === undefined
          ? "—"
          : Number(formatUnits(amount, decimals)).toLocaleString("en-US", {
              maximumFractionDigits: 6,
            })}
      </span>
    </div>
  );
}

/**
 * A revert turned into something a person can act on.
 *
 * viem's errors carry the useful part several layers down and the useless part
 * at the top, so the raw message is a wall of ABI detail that ends in
 * "execution reverted". These are the failures that actually happen on this
 * router, each with the thing to do about it.
 */
function readableError(e: unknown): string {
  const raw = e instanceof Error ? `${e.message}` : String(e);
  const text = raw.toLowerCase();

  if (text.includes("user rejected") || text.includes("user denied")) {
    return "You rejected the transaction.";
  }
  if (text.includes("v3toosmall") || text.includes("too little received")) {
    return "Price moved past your slippage. Raise it or trade a smaller size.";
  }
  if (text.includes("transaction deadline passed") || text.includes("deadline")) {
    return "The quote expired. Try again.";
  }
  if (text.includes("insufficient")) {
    return "Not enough balance, once gas is accounted for.";
  }
  if (text.includes("invalidcommand") || text.includes("execution reverted")) {
    return (
      "The router rejected this swap. The pool may not be routable through " +
      "this path, or its liquidity moved. Nothing was sent."
    );
  }
  return raw.length > 140 ? "The trade could not be prepared." : raw;
}
