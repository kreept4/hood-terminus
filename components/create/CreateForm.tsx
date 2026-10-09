"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContract,
  useSignMessage,
  useWriteContract,
} from "wagmi";
import { formatEther, parseEther, decodeEventLog, type Address } from "viem";
import { Card } from "@/components/primitives/Card";

import { TokenImageField } from "@/components/create/TokenImageField";
import { ConnectWallet } from "@/components/wallet/ConnectWallet";
import { clsx } from "@/lib/clsx";
import {
  LAUNCHPAD_ABI,
  LAUNCHPAD_ADDRESS,
  isLaunchpadDeployed,
} from "@/lib/launchpad";
import { LAUNCH_FEE_ETH } from "@/lib/chain/launch-fee";
import {
  NATIVE,
  QUOTE_ASSETS,
  MAX_CREATOR_TAX_PERCENT,
  DEFAULT_CREATOR_SHARE_PERCENT,
  quoteAsset,
} from "@/lib/launchpad/quotes";
import { QuoteLogo } from "@/components/market/QuoteLogo";
import { robinhoodChain } from "@/lib/chain";
import { tokenMetaMessage } from "@/lib/launchpad/meta-auth";

/**
 * Token creation.
 *
 * One way to open, because demanding liquidity up front is the thing that stops
 * most launches happening at all. The token opens with nothing in it: buyers'
 * ETH collects in the curve as they buy, and a real pool is created out of that
 * once it reaches four ETH. The creator brings a name and a reason to care
 * rather than capital, which is how a launch that catches a narrative pulls its
 * own liquidity in.
 *
 * Seeding a pool directly used to be offered alongside this, suggesting a tenth
 * of an ETH. It was removed: it read as an alternative to the four ETH the
 * curve needs, when in fact it was a different and far worse deal for the same
 * token, and no reader could tell which number applied to them.
 *
 * The form prices the launch in full before a wallet is ever asked to sign.
 * Staring at a signing prompt is the worst possible moment to find out what
 * something costs.
 *
 * Deployment is not wired yet. The button says so rather than opening a wallet
 * and failing, and nothing here implies a token has been created.
 */

/**
 * Supply, low to high.
 *
 * A slider rather than four buttons, because these are points on one scale and
 * a slider says so where a row of buttons says "four unrelated options".
 *
 * The stops are marked because the values are not evenly spaced: each is ten
 * times the last, so a continuous slider would crowd 1M and 10M into a pixel at
 * one end and leave the rest of the track empty.
 */
const SUPPLY_STOPS = [
  { value: 1_000_000, label: "1M" },
  { value: 10_000_000, label: "10M" },
  { value: 100_000_000, label: "100M" },
  { value: 1_000_000_000, label: "1B" },
];



export function CreateForm() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  // Proves control of the creator wallet to `/api/token-meta`, which cannot
  // take that on trust. See `saveArtwork`.
  const { signMessageAsync } = useSignMessage();

  // The live fee, so the amount shown and the amount sent are the same number.
  const { data: chainFee } = useReadContract({
    address: LAUNCHPAD_ADDRESS as `0x${string}`,
    abi: LAUNCHPAD_ABI,
    functionName: "launchFee",
    query: { enabled: isLaunchpadDeployed() },
  });
  /**
   * The fee actually charged, or nothing until the chain has answered.
   *
   * Not defaulted to the constant for the amount that gets sent. The setter is
   * owner-only and can move at any time, so a stale fallback would send the
   * wrong `value` and revert the launch with WrongLaunchFee. Better to hold
   * the button for a moment than to take a signature for a transaction that
   * cannot succeed.
   */
  const feeKnown = typeof chainFee === "bigint";
  const launchFeeEth = feeKnown ? Number(chainFee) / 1e18 : LAUNCH_FEE_ETH;

  /**
   * The creator's share of the trade fee, as a percentage, live from the pad.
   *
   * Unlike the launch fee this never goes into a transaction, so a fallback is
   * safe: the worst a stale number does here is read wrong for a moment, and
   * showing nothing at all in a sentence about what somebody earns is worse.
   */
  const { data: shareBps } = useReadContract({
    address: LAUNCHPAD_ADDRESS as `0x${string}`,
    abi: LAUNCHPAD_ABI,
    functionName: "creatorShareBps",
    query: { enabled: isLaunchpadDeployed() },
  });
  const creatorSharePercent =
    typeof shareBps === "number" ? shareBps / 100 : DEFAULT_CREATOR_SHARE_PERCENT;
  const publicClient = usePublicClient();

  const deployed = isLaunchpadDeployed();
  const [status, setStatus] = useState<
    "idle" | "checking" | "signing" | "mining"
  >("idle");
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchedToken, setLaunchedToken] = useState<string | null>(null);
  /**
   * Whether the picture made it as far as the token.
   *
   * Separate from the launch because they can differ: the launch is a
   * transaction and the artwork is a row in our own table, and the second can
   * fail on its own. When it does, the creator is the only person who can
   * authorise the retry, so they have to be told.
   */
  const [artwork, setArtwork] = useState<"idle" | "saving" | "saved" | "failed">(
    "idle",
  );
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [pitch, setPitch] = useState("");
  // Defaults to the last stop, 1B, which is the memecoin convention.
  const [supplyIndex, setSupplyIndex] = useState(SUPPLY_STOPS.length - 1);
  const [customSupply, setCustomSupply] = useState<string | null>(null);
  const [feeRecipient, setFeeRecipient] = useState("");
  /** What the token trades against. Fixed at launch and never changeable. */
  const [quote, setQuote] = useState<`0x${string}`>(NATIVE);
  /**
   * The creator's own cut of every trade, as a percentage.
   *
   * Held as a string so the field can be empty while being typed rather than
   * snapping to zero. Converted to basis points at the last moment.
   */
  const [creatorTax, setCreatorTax] = useState("0");

  /**
   * What the network will charge on top, and whether the wallet can cover it.
   *
   * This was missing entirely, which is the complaint: the panel showed a fee
   * and a total that did not include gas, so a wallet holding exactly the fee
   * looked sufficient and was not. The launch then failed at the simulate step
   * with a message that named none of it.
   *
   * Estimated against the real call rather than assumed, because this is an
   * Orbit chain and the L1 data cost moves with the size of the transaction.
   */
  const [gasEth, setGasEth] = useState<number | null>(null);
  const { data: walletBalance } = useBalance({
    address,
    chainId: robinhoodChain.id,
    query: { refetchInterval: 20_000 },
  });

  const errors = useMemo(() => {
    const next: Record<string, string> = {};
    if (name && name.trim().length < 2) next.name = "At least two characters";
    if (name.length > 32) next.name = "Thirty-two characters at most";
    if (symbol && !/^[A-Z0-9]{2,10}$/.test(symbol)) {
      next.symbol = "Two to ten letters or digits";
    }
    if (feeRecipient && !/^0x[0-9a-fA-F]{40}$/.test(feeRecipient.trim())) {
      next.feeRecipient = "That is not a wallet address.";
    }
    return next;
  }, [name, symbol, feeRecipient]);

  // The slider snaps, because supply is a signalling choice rather than a
  // precise one: 1B reads as a memecoin, 847,392,013 reads as a mistake. Total
  // supply and price are inversely related, so every stop is the same market
  // cap at a different decimal place and the number itself is cosmetic.
  //
  // The custom field exists anyway, because a creator picking 69,420,000 has a
  // reason and it is not one the interface should overrule.
  const supply =
    customSupply !== null && Number(customSupply) > 0
      ? Math.floor(Number(customSupply))
      : SUPPLY_STOPS[supplyIndex].value;

  const complete =
    supply > 0 &&
    name.trim().length >= 2 &&
    /^[A-Z0-9]{2,10}$/.test(symbol) &&
    Object.keys(errors).length === 0;

  const liq = 0;
  const total = liq + launchFeeEth;

  /**
   * Deploys the token.
   *
   * Simulated before the wallet is ever prompted. A launch that reverts costs
   * gas and explains nothing, and the failure modes here are all things the
   * form can state plainly instead: too little sent, a name the contract
   * rejects, the wrong network.
   *
   * Anything paid above the launch fee becomes the creator's own first buy on
   * the curve, which is what the contract does with the surplus.
   */
  /**
   * Whether the wallet can cover the fee, the first buy and the gas together.
   *
   * Checked before the button rather than discovered at the simulate step,
   * which is where this failed with a message that named nothing.
   */
  /**
   * Whether an estimate is even possible yet.
   *
   * Derived rather than written into state from inside the effect. Clearing it
   * synchronously there was a cascading render on every keystroke in the form,
   * because `complete` changes as somebody types a name.
   */
  const canEstimate = Boolean(
    publicClient && address && deployed && feeKnown && complete,
  );

  const gas = canEstimate ? gasEth : null;

  const short =
    walletBalance !== undefined &&
    gas !== null &&
    Number(formatEther(walletBalance.value)) < total + gas;

  useEffect(() => {
    if (!canEstimate || !publicClient || !address) return;
    let live = true;

    publicClient
      .estimateContractGas({
        account: address,
        address: LAUNCHPAD_ADDRESS as Address,
        abi: LAUNCHPAD_ABI,
        functionName: "launch",
        args: [
          name.trim(),
          symbol,
          (feeRecipient.trim() ||
            "0x0000000000000000000000000000000000000000") as Address,
          quote,
          taxBpsFrom(creatorTax),
        ],
        value: parseEther(String(total)),
      })
      .then(async (gas) => {
        const fees = await publicClient.estimateFeesPerGas();
        // A fifth on top, because the block it lands in is not the block it
        // was priced in.
        if (live) {
          setGasEth(Number(formatEther((gas * fees.maxFeePerGas * 6n) / 5n)));
        }
      })
      .catch(() => {
        // An estimate that cannot be made is shown as unknown rather than as
        // zero, which would understate what the launch costs.
        if (live) setGasEth(null);
      });

    return () => {
      live = false;
    };
  }, [
    canEstimate,
    publicClient,
    address,
    name,
    symbol,
    feeRecipient,
    quote,
    creatorTax,
    total,
  ]);

  /**
   * Attaches the picture and the blurb to a token that already exists.
   *
   * Split out of the launch so it can be run again. The route authorises this
   * against the launchpad's own record of who created the token, so the retry
   * needs no session and works for as long as the creator is connected with the
   * wallet that launched it.
   *
   * ── The signature ──────────────────────────────────────────────────────
   *
   * A second wallet prompt, and worth the friction. Naming the creator in the
   * request body proved nothing: that address is public on chain, so the
   * server could not tell the real creator from anyone who had read the
   * launch. Signing is what turns it from a claim into proof.
   *
   * It moves no funds and the wallet shows the text in full, which is written
   * to be readable for exactly that reason. A rejected prompt is a normal
   * outcome, not a failure to report loudly: the token is already launched and
   * the artwork can be attached later from the same page.
   */
  async function saveArtwork(token: string, creator: string) {
    setArtwork("saving");

    const description = pitch.trim() || null;
    const issuedAt = Date.now();

    let signature: string;
    try {
      signature = await signMessageAsync({
        message: tokenMetaMessage({
          token,
          creator,
          imageUrl,
          description,
          issuedAt,
        }),
      });
    } catch {
      // Declined in the wallet, or no wallet to ask. Nothing was written.
      setArtwork("failed");
      return;
    }

    try {
      const response = await fetch("/api/token-meta", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          creator,
          imageUrl,
          description,
          signature,
          issuedAt,
        }),
      });
      setArtwork(response.ok ? "saved" : "failed");
      if (response.ok) router.refresh();
    } catch {
      setArtwork("failed");
    }
  }

  async function launch() {
    if (!deployed || !complete || !address || !publicClient) return;
    setLaunchError(null);
    setLaunchedToken(null);

    const value = parseEther(String(total));
    // Zero means "the caller", which the contract resolves to msg.sender.
    const recipient = (feeRecipient.trim() ||
      "0x0000000000000000000000000000000000000000") as Address;
    const taxBps = taxBpsFrom(creatorTax);

    try {
      setStatus("checking");
      await publicClient.simulateContract({
        account: address,
        address: LAUNCHPAD_ADDRESS as Address,
        abi: LAUNCHPAD_ABI,
        functionName: "launch",
        args: [name.trim(), symbol, recipient, quote, taxBps],
        value,
      });

      setStatus("signing");
      const hash = await writeContractAsync({
        // Pinned. Without it wagmi builds the call for whatever chain the
        // wallet happens to be on, which sent a launchpad transaction to
        // Ethereum mainnet where the contract does not exist and the wallet
        // holds no gas. Naming the chain makes wagmi switch or fail loudly.
        chainId: robinhoodChain.id,
        address: LAUNCHPAD_ADDRESS as Address,
        abi: LAUNCHPAD_ABI,
        functionName: "launch",
        args: [name.trim(), symbol, recipient, quote, taxBps],
        value,
      });

      setStatus("mining");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // The token address comes off the Launched event rather than the return
      // value: a transaction receipt carries logs, not return data.
      for (const log of receipt.logs) {
        try {
          const parsed = decodeEventLog({
            abi: LAUNCHPAD_ABI,
            data: log.data,
            topics: log.topics,
          });
          if (parsed.eventName === "Launched") {
            const token = (parsed.args as { token: string }).token;
            setLaunchedToken(token);

            /**
             * Artwork is saved after the fact, and failing to save it must not
             * read as a failed launch. The token exists on chain either way;
             * this is the picture on top of it.
             *
             * But it must not fail silently either, which is what this used to
             * do. The write went out with its result thrown away, so when the
             * table it writes to did not yet exist, a launch reported success,
             * the uploaded file sat in storage attached to nothing, and the
             * first anyone knew of it was a token with no picture and no way
             * to give it one. The outcome is tracked now, and a failure leaves
             * a button that tries again.
             */
            if ((imageUrl || pitch.trim()) && address) {
              void saveArtwork(token, address);
            }

            router.refresh();
            break;
          }
        } catch {
          // Not our event. Receipts carry logs from every contract touched.
        }
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const text = raw.toLowerCase();
      setLaunchError(
        text.includes("user rejected") || text.includes("user denied")
          ? "You rejected the transaction."
          : text.includes("wronglaunchfee")
            ? "The launch fee changed. Reload and try again."
            : text.includes("emptystring")
              ? "The contract rejected that name or ticker."
              : /* Named individually, because "it just failed" is what this
                   used to say and it sent people looking at the contract. */
                text.includes("insufficient") || text.includes("exceeds the balance")
                ? `Not enough ETH. This launch costs about ${(total + (gas ?? 0)).toFixed(6)} ETH including gas.`
                : text.includes("chain") && text.includes("match")
                  ? `Your wallet is on the wrong network. Switch it to ${robinhoodChain.name}.`
                  : `The launch could not be prepared and nothing was sent. ${raw.slice(0, 140)}`,
      );
    } finally {
      setStatus("idle");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
      <Card className="p-5 lg:col-span-7 lg:p-6">
        <div className="flex flex-col gap-6">
          <Field label="Name" error={errors.name}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder=""
              maxLength={32}
              className={INPUT}
            />
          </Field>

          <Field label="Ticker" error={errors.symbol}>
            <input
              value={symbol}
              onChange={(e) =>
                setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
              }
              placeholder="XYZ"
              maxLength={10}
              className={clsx(INPUT, "tnum")}
            />
          </Field>

          {/* Not cosmetic, and the reason this chain is interesting.
              The pairing decides what buyers spend, what sellers receive, what
              the creator earns in, and which market the token opens against at
              graduation. Pairing against NVDA means a memecoin that trades
              against a stock. */}
          <Field label="Paired with">
            <div className="flex flex-wrap gap-2">
              {QUOTE_ASSETS.map((asset) => {
                const active = asset.address.toLowerCase() === quote.toLowerCase();
                return (
                  <button
                    key={asset.address}
                    type="button"
                    onClick={() => setQuote(asset.address)}
                    className={clsx(
                      "flex items-center gap-2 rounded-md border px-3 py-2 text-body",
                      "transition-colors duration-100",
                      active
                        ? "border-green-line bg-green-deep text-green"
                        : "border-line text-ink-2 hover:border-green-line hover:text-ink",
                    )}
                  >
                    <QuoteLogo quote={asset.address} size={20} />
                    {asset.symbol}
                  </button>
                );
              })}
            </div>
            <span className="text-micro text-ink-3">
              Fixed at launch. Everything about this token is priced in it.
            </span>
          </Field>

          {/* Capped where the contract caps it, and stated as the reason rather
              than as a rule: above roughly ten percent the sniper bots that
              give a new token its first volume stop picking it up. */}
          <Field label="Creator rewards" hint="Optional">
            <div className="flex items-center gap-2">
              <input
                value={creatorTax}
                onChange={(e) => setCreatorTax(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                spellCheck={false}
                className={clsx(INPUT, "tnum w-28")}
              />
              <span className="text-body text-ink-3">
                % of every trade, up to {MAX_CREATOR_TAX_PERCENT}%
              </span>
            </div>
            <span className="text-micro text-ink-3">
              Yours on top of your {creatorSharePercent}% of the trade fee.
              Fixed at launch, so it can never be raised on people who already
              bought.
            </span>
          </Field>

          {/* Optional, and almost always left alone. It matters for the case
              where the launching wallet should not be the earning wallet: a hot
              wallet launching for a cold one, or a team using a multisig. */}
          <Field
            label="Fee recipient"
            hint="Optional"
            error={errors.feeRecipient}
          >
            <input
              value={feeRecipient}
              onChange={(e) => setFeeRecipient(e.target.value.trim())}
              placeholder="Defaults to your connected wallet"
              spellCheck={false}
              className={clsx(INPUT, "tnum")}
            />
            <span className="text-micro text-ink-3">
              Where your {creatorSharePercent}% of every trade fee accrues. Set
              once at launch and never changeable afterwards.
            </span>
          </Field>

          <TokenImageField value={imageUrl} onChange={setImageUrl} />

          <Field label="Token details" hint={`${pitch.length}/140`} numericHint>
            <textarea
              value={pitch}
              onChange={(e) => setPitch(e.target.value.slice(0, 140))}
              placeholder="What the token is, in a line."
              rows={2}
              className={clsx(INPUT, "resize-none")}
            />

          </Field>

          <div className="flex flex-col gap-2">
            <span className="flex items-baseline justify-between gap-3">
              <label htmlFor="supply" className="text-body font-medium text-ink">
                Total supply
              </label>
              <span className="tnum text-body text-green">
                {SUPPLY_STOPS[supplyIndex].label}
              </span>
            </span>

            <input
              id="supply"
              type="range"
              min={0}
              max={SUPPLY_STOPS.length - 1}
              step={1}
              value={supplyIndex}
              disabled={customSupply !== null}
              onChange={(e) => setSupplyIndex(Number(e.target.value))}
              className={clsx(
                "supply-range w-full",
                customSupply !== null && "opacity-40",
              )}
            />

            {/* The stops, and also the way to jump straight to one. A marked
                scale you cannot click is a scale that makes you drag. */}
            <div className="flex justify-between">
              {SUPPLY_STOPS.map((stop, i) => (
                <button
                  key={stop.value}
                  type="button"
                  onClick={() => {
                    setSupplyIndex(i);
                    setCustomSupply(null);
                  }}
                  className={clsx(
                    "tnum text-micro transition-colors duration-100",
                    customSupply === null && i === supplyIndex
                      ? "text-ink"
                      : "text-ink-3 hover:text-ink-2",
                  )}
                >
                  {stop.label}
                </button>
              ))}
            </div>

            {customSupply === null ? (
              <button
                type="button"
                onClick={() => setCustomSupply("")}
                className="self-start text-micro text-ink-3 transition-colors duration-100 hover:text-green"
              >
                Set an exact number
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  value={customSupply}
                  onChange={(e) =>
                    setCustomSupply(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  inputMode="numeric"
                  placeholder="69420000"
                  className={clsx(INPUT, "tnum")}
                />
                <button
                  type="button"
                  onClick={() => setCustomSupply(null)}
                  className="shrink-0 rounded-md border border-line px-2.5 py-2 text-micro text-ink-3 transition-colors duration-100 hover:border-line hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

        </div>
      </Card>

      <div className="flex flex-col gap-4 lg:col-span-5">
        <Card className="p-5">
          <h2 className="text-lead font-semibold text-ink">Review</h2>

          <dl className="mt-4 flex flex-col gap-3">
            <Row label="Name" value={name || "Not set"} muted={!name} />
            <Row label="Ticker" value={symbol || "Not set"} muted={!symbol} mono />
            <Row
              label="Supply"
              value={supply > 0 ? supply.toLocaleString("en-US") : "Not set"}
              muted={supply <= 0}
              mono
            />
            {feeRecipient && !errors.feeRecipient && (
              <Row
                label="Fees go to"
                value={`${feeRecipient.slice(0, 6)}…${feeRecipient.slice(-4)}`}
                mono
              />
            )}
            <Row label="Chain" value="Robinhood Chain" />
            <Row label="Paired with" value={quoteAsset(quote).symbol} mono />
            <Row
              label="Your rewards"
              value={
                taxBpsFrom(creatorTax) === 0
                  ? "Half the trade fee"
                  : `${taxBpsFrom(creatorTax) / 100}% + half the trade fee`
              }
            />
          </dl>

          <dl className="mt-4 flex flex-col gap-3 border-t border-line-soft pt-4">
            {/* Follows the pairing above it. A fixed "4 ETH" here was wrong the
                moment a token could be paired against anything else, and it sat
                directly beneath the control that changes it. */}
            <Row
              label="Becomes a pool at"
              value={`${quoteAsset(quote).graduation} ${quoteAsset(quote).symbol}`}
              mono
            />
            <Row
              label="Launch fee"
              value={feeKnown ? `${launchFeeEth} ETH` : "Reading the chain"}
              mono={feeKnown}
              muted={!feeKnown}
            />
            <Row
              label="Network fee"
              value={gas === null ? "Not yet known" : `~${gas.toFixed(6)} ETH`}
              mono={gas !== null}
              muted={gas === null}
            />
            <div className="flex items-baseline justify-between gap-3 border-t border-line-soft pt-3">
              <dt className="text-body font-medium text-ink">You pay</dt>
              {/* Six places, not four. At a fee of 0.000444 `toFixed(4)` printed
                  0.0004, so the panel quoted a number the launch never charged
                  and the arithmetic underneath it looked wrong. */}
              <dd className="tnum text-lead font-semibold text-ink">
                {(total + (gas ?? 0)).toFixed(6)} ETH
              </dd>
            </div>
            {short && (
              <p className="text-micro text-red">
                This wallet holds {Number(formatEther(walletBalance!.value)).toFixed(6)} ETH,
                which is short of that.
              </p>
            )}
          </dl>

          <div className="mt-5">
            {!isConnected ? (
              /**
               * Two doors, both visible.
               *
               * This was one button that opened a sheet containing both paths,
               * so the choice was hidden behind a control that did not say what
               * it was. The nav never worked that way and there is no reason
               * this should: signing in and linking a wallet are different
               * decisions with different consequences, and somebody about to
               * spend money should be able to see both before choosing.
               */
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
            ) : (
              <button
                type="button"
                onClick={launch}
                disabled={!deployed || !feeKnown || !complete || status !== "idle"}
                className={clsx(
                  "w-full rounded-md px-4 py-3 text-body font-semibold transition-opacity duration-100",
                  deployed && complete && status === "idle"
                    ? "bg-green text-on-accent hover:opacity-90"
                    : "border border-line text-ink-3",
                )}
              >
                {!deployed
                  ? "Launchpad not deployed on this network"
                  : /* Said out loud. The button was gated on the chain having
                       answered with the fee, but its label never mentioned it,
                       so a slow read looked like a dead button. */
                    !feeKnown
                    ? "Reading the launch fee"
                  : status === "checking"
                    ? "Checking the launch"
                    : status === "signing"
                      ? "Confirm in your wallet"
                      : status === "mining"
                        ? "Deploying"
                        : complete
                          ? "Launch token"
                          : "Complete the form"}
              </button>
            )}
          </div>

          {launchError && (
            <p className="mt-3 text-micro text-red">{launchError}</p>
          )}

          {launchedToken && (
            <div className="mt-3 rounded-md border border-green-line bg-green-deep p-3">
              <p className="text-body font-medium text-green">
                {symbol} is live
              </p>
              <p className="tnum mt-1 text-micro break-all text-ink-2">
                {launchedToken}
              </p>

              {/* The token is on chain regardless. This is only about whether
                  the picture reached it, and it is here because the creator is
                  the only person allowed to send it again. */}
              {artwork === "failed" && (
                <div className="mt-3 border-t border-green-line pt-3">
                  <p className="text-micro text-ink-2">
                    The token launched, but its image and description did not
                    save.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (launchedToken && address) {
                        void saveArtwork(launchedToken, address);
                      }
                    }}
                    className="mt-2 rounded-sm border border-line px-2.5 py-1.5 text-micro text-ink transition-colors duration-100 hover:border-green hover:text-green"
                  >
                    Try saving them again
                  </button>
                </div>
              )}
              {artwork === "saving" && (
                <p className="mt-2 text-micro text-ink-3">Saving the image</p>
              )}
            </div>
          )}

          {!deployed && (
            <p className="mt-3 text-micro text-ink-3">
              The launchpad contract is not deployed on this network yet.
              Everything above is wired to it and will work the moment it is.
            </p>
          )}

        </Card>

        <Card className="p-5">
          <h2 className="text-lead font-semibold text-ink">Trading fees</h2>
          <p className="mt-2 text-body text-ink-2">
            Fees from every trade on your token come back to you, claimable here
            whenever you want them.
          </p>
          <dl className="mt-4 flex flex-col gap-3">
            <Row label="Earned so far" value="0 ETH" mono />
            <Row label="Claimable" value="Any time" />
          </dl>
        </Card>
      </div>
    </div>
  );
}

const INPUT =
  "w-full rounded-md border border-line bg-surface-2 px-3 py-2.5 text-body text-ink " +
  "placeholder:text-ink-3 focus:border-green focus:outline-none";


function Field({
  label,
  hint,
  numericHint = false,
  error,
  children,
}: {
  label: string;
  hint?: string;
  /** Set for counters and figures. Words stay in the interface family. */
  numericHint?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-body font-medium text-ink">{label}</span>
        {hint && (
          <span
            className={clsx("text-micro text-ink-3", numericHint && "tnum")}
          >
            {hint}
          </span>
        )}
      </span>
      {children}
      {error && <span className="text-micro text-red">{error}</span>}
    </label>
  );
}

function Row({
  label,
  value,
  muted = false,
  mono = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-body text-ink-3">{label}</dt>
      <dd
        className={clsx(
          "truncate text-body",
          mono && "tnum",
          muted ? "text-ink-3" : "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}


/**
 * A percentage typed by a person, as basis points the contract understands.
 *
 * Clamped rather than rejected. Somebody typing 15 into a field capped at 9 has
 * said what they want clearly enough, and refusing the whole launch over it
 * teaches nothing the field could not have said itself.
 */
function taxBpsFrom(percent: string): number {
  const value = Number(percent);
  if (!Number.isFinite(value) || value <= 0) return 0;
  const capped = Math.min(value, MAX_CREATOR_TAX_PERCENT);
  return Math.round(capped * 100);
}
