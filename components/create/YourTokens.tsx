"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { Card } from "@/components/primitives/Card";
import { clsx } from "@/lib/clsx";
import { robinhoodChain } from "@/lib/chain";
import { LAUNCHPAD_ABI, LAUNCHPAD_ADDRESS, isLaunchpadDeployed } from "@/lib/launchpad";
import {
  getCreatedTokens,
  getFeesOwed,
  type CreatedToken,
} from "@/lib/launchpad/launches";
import { quoteAsset } from "@/lib/launchpad/quotes";
import { formatQuoteAmount } from "@/lib/format";
import { TokenLogo } from "@/components/market/TokenLogo";
import type { Address } from "viem";

/**
 * What this wallet has launched, and how it is doing.
 *
 * Shown only to a connected wallet, because it is that wallet's own record.
 * There is nothing to sign in to: the launchpad stores the creator of every
 * token, so connecting is the whole of the authentication.
 *
 * Performance here means the two numbers a creator actually acts on: how close
 * the token is to opening a market, and how much it has earned them. Price and
 * market cap belong on the token's own page and are one click away.
 */
export function YourTokens() {
  const { address, isConnected } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [tokens, setTokens] = useState<CreatedToken[] | null>(null);
  const [fees, setFees] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /**
   * Artwork, by token address.
   *
   * Fetched separately from the chain read because it does not live on the
   * chain. Its own request rather than part of `load` so that a metadata table
   * being unreachable cannot take down the panel that shows a creator whether
   * their token graduated.
   */
  const [art, setArt] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!client || !address) return;
    try {
      const [list, owed] = await Promise.all([
        getCreatedTokens(client, address),
        getFeesOwed(client, address),
      ]);
      setTokens(list);
      setFees(owed);
      setError(null);

      // Outside the failure path above on purpose: a picture that will not
      // load must not turn into "could not read your tokens".
      void getArtwork(list.map((t) => t.address)).then(setArt);
    } catch {
      setError("Could not read your tokens from the chain. Try again shortly.");
      setTokens([]);
    }
  }, [client, address]);

  useEffect(() => {
    if (!isConnected) {
      setTokens(null);
      return;
    }
    void load();
  }, [isConnected, load]);

  if (!isLaunchpadDeployed() || !isConnected) return null;

  /**
   * Opens the Uniswap market for a graduated token.
   *
   * Surfaced to the creator because they are the one with a reason to press
   * it. Anyone can call it, so this is a convenience rather than a permission.
   */
  async function openMarket(token: Address) {
    setBusy(token);
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
        functionName: "finalisePool",
        args: [token],
      });
      await load();
    } catch (e) {
      setError(
        e instanceof Error && /rejected|denied/i.test(e.message)
          ? "You rejected the transaction."
          : "Opening the market failed. The token keeps its reserves, so it can be retried.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function withdraw() {
    setBusy("fees");
    setError(null);
    try {
      await writeContractAsync({
        chainId: robinhoodChain.id,
        address: LAUNCHPAD_ADDRESS as Address,
        abi: LAUNCHPAD_ABI,
        functionName: "withdrawFees",
        // Native, which is what a fee balance was before pairings existed.
        // A token paired against something else is claimed on the portfolio.
        args: ["0x0000000000000000000000000000000000000000"],
      });
      await load();
    } catch {
      setError("Withdrawing failed. Your fees stay credited to you.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-14 flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-h2 leading-none font-bold tracking-tight text-ink">
          Your tokens
        </h2>

        {fees > 0 && (
          <button
            type="button"
            onClick={withdraw}
            disabled={busy !== null}
            className="rounded-md bg-green px-4 py-2 text-body font-semibold text-on-accent transition-opacity duration-100 hover:opacity-90 disabled:opacity-50"
          >
            {busy === "fees"
              ? "Withdrawing"
              : `Withdraw ${fees.toFixed(5)} ETH`}
          </button>
        )}
      </div>

      {error && <p className="text-micro text-red">{error}</p>}

      {tokens === null ? (
        <Card className="px-5 py-12">
          <p className="text-center text-body text-ink-3">Reading the chain.</p>
        </Card>
      ) : tokens.length === 0 ? (
        <Card className="px-5 py-12">
          <p className="mx-auto max-w-md text-center text-body text-ink-3">
            You have not launched anything from this wallet yet.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {tokens.map((t) => (
            <Card key={t.address} className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-3">
                {/* The creator's own upload, which is the only picture this
                    token has anywhere. It was missing here while the curve
                    board showed it, so a creator's own list of their tokens
                    was the one place their art did not appear. */}
                <TokenLogo
                  symbol={t.symbol}
                  address={t.address}
                  src={art[t.address.toLowerCase()] ?? null}
                  size={34}
                />
                <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                  <Link
                    href={`/t/${t.address}`}
                    className="min-w-0 truncate text-body font-medium text-ink transition-colors duration-100 hover:text-green"
                  >
                    {t.name}
                  </Link>
                  <span className="tnum shrink-0 text-micro text-ink-3">
                    {t.symbol}
                  </span>
                </div>
              </div>

              <Progress token={t} />

              <div className="flex items-baseline justify-between gap-3">
                {/* In the pairing's units. This read "of 4 ETH" for every
                    token, which on an NVDA curve was both the wrong number and
                    the wrong asset. */}
                <span className="tnum text-micro text-ink-2">
                  {formatQuoteAmount(t.raisedEth)} of {t.graduation}{" "}
                  {quoteAsset(t.quote).symbol}
                </span>
                <Status token={t} />
              </div>

              {t.awaitingMarket && (
                <button
                  type="button"
                  onClick={() => openMarket(t.address)}
                  disabled={busy !== null}
                  className="rounded-md bg-green px-4 py-2 text-body font-semibold text-on-accent transition-opacity duration-100 hover:opacity-90 disabled:opacity-50"
                >
                  {busy === t.address ? "Opening" : "Open the market"}
                </button>
              )}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function Progress({ token }: { token: CreatedToken }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className={clsx(
          "h-full rounded-full transition-[width] duration-300",
          token.graduated ? "bg-green" : "bg-ink-3",
        )}
        style={{ width: `${Math.max(token.progress * 100, 2)}%` }}
      />
    </div>
  );
}

/**
 * Artwork for a creator's own tokens, read from the browser.
 *
 * Straight to the metadata table rather than through a route of our own. The
 * rows are world-readable by policy, which is correct because they are pictures
 * for public tokens, so a server hop would add a request and hide nothing.
 *
 * Returns an empty map on any failure. Every caller falls back to a monogram.
 */
async function getArtwork(tokens: Address[]): Promise<Record<string, string>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || tokens.length === 0) return {};

  const list = tokens.map((t) => t.toLowerCase()).join(",");
  try {
    const response = await fetch(
      `${url}/rest/v1/token_metadata?select=token_address,image_url&token_address=in.(${list})`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!response.ok) return {};
    const rows: { token_address: string; image_url: string | null }[] =
      await response.json();

    const out: Record<string, string> = {};
    for (const row of rows) {
      if (row.image_url) out[row.token_address] = row.image_url;
    }
    return out;
  } catch {
    return {};
  }
}


function Status({ token }: { token: CreatedToken }) {
  if (token.pool) {
    return <span className="text-micro text-green">Trading</span>;
  }
  if (token.awaitingMarket) {
    return <span className="text-micro text-ink">Ready to open</span>;
  }
  return <span className="text-micro text-ink-3">On the curve</span>;
}
