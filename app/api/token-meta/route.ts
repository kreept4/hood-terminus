import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, getAddress, isAddress, verifyMessage } from "viem";
import { robinhoodChain } from "@/lib/chain";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { LAUNCHPAD_ABI, LAUNCHPAD_ADDRESS, isLaunchpadDeployed } from "@/lib/launchpad";
import {
  META_CLAIM_TTL_MS,
  tokenMetaMessage,
} from "@/lib/launchpad/meta-auth";

/**
 * Attaches artwork and a blurb to a launched token.
 *
 * Authorised by the chain rather than by a session. There is no sign-in here,
 * so the question "may this caller set this token's image" has no answer in
 * our own database; it has one in the launchpad, which records the creator of
 * every launch.
 *
 * ── Two checks, and why one of them was never enough ───────────────────────
 *
 * This route used to read the creator off the launchpad and compare it to a
 * `creator` field in the request body, and treat matching as authorisation.
 * That is not authorisation. Every launch's creator is public on chain, so the
 * check asked the caller to repeat a value they could look up, and passing it
 * required nothing but a copy and a paste. Any stranger could rewrite any
 * token's logo and description, sitewide, with one unauthenticated request.
 *
 * The comparison stays, because it is still the right question about *which*
 * address may write. What it needed was the other half:
 *
 *   1. the signature proves the caller controls `creator`
 *   2. the launchpad proves `creator` is the one who launched this token
 *
 * Neither is sufficient alone. Without 1, anyone may claim any address.
 * Without 2, anyone may sign as themselves and edit somebody else's token.
 *
 * The signed text covers the image and the description as well as the address,
 * so a captured signature can only re-assert the values it was made for, and
 * it expires. See `lib/launchpad/meta-auth.ts`.
 *
 * This is also why the table grants anon no insert: the service role key used
 * below bypasses RLS entirely, so this function is the only thing standing
 * between a stranger and that table.
 */

const RPC =
  process.env.ALCHEMY_HTTPS_URL ?? "https://rpc.mainnet.chain.robinhood.com";

export async function POST(request: Request) {
  const limited = rateLimit(clientKey(request, "token-meta"), 20, 3_600_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || !isLaunchpadDeployed()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  let body: {
    token?: string;
    creator?: string;
    imageUrl?: string | null;
    description?: string | null;
    signature?: string;
    issuedAt?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const { token, creator, signature, issuedAt } = body;
  /**
   * Normalised before anything reads them, because these exact values go into
   * the signed text. `undefined` and `""` and `null` all mean "no image" to a
   * form and would each build a different message to verify against.
   */
  const imageUrl = body.imageUrl ? String(body.imageUrl) : null;
  const description = body.description ? String(body.description) : null;

  if (!token || !isAddress(token) || !creator || !isAddress(creator)) {
    return NextResponse.json({ error: "Bad address." }, { status: 400 });
  }
  if (imageUrl && !isSafeImageUrl(imageUrl)) {
    return NextResponse.json(
      { error: "Image links must be https." },
      { status: 400 },
    );
  }
  if (description && description.length > 140) {
    return NextResponse.json({ error: "Description is too long." }, { status: 400 });
  }

  // ── Authorisation, part one: does the caller control this address? ───────
  //
  // Checked before the chain is read, because it costs nothing and an
  // unsigned request should never buy an unauthenticated caller an RPC call.
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    return NextResponse.json({ error: "Not signed." }, { status: 401 });
  }
  if (typeof issuedAt !== "number" || !Number.isFinite(issuedAt)) {
    return NextResponse.json({ error: "Not signed." }, { status: 401 });
  }

  /**
   * Freshness, tolerant in one direction only.
   *
   * `issuedAt` comes off the caller's clock, and consumer clocks run a little
   * fast often enough that rejecting every future timestamp would fail real
   * creators. A minute of lead is allowed; the full window applies backwards.
   */
  const age = Date.now() - issuedAt;
  if (age > META_CLAIM_TTL_MS || age < -60_000) {
    return NextResponse.json(
      { error: "That signature has expired. Try again." },
      { status: 401 },
    );
  }

  let signedByCreator = false;
  try {
    signedByCreator = await verifyMessage({
      address: getAddress(creator),
      message: tokenMetaMessage({
        token,
        creator,
        imageUrl,
        description,
        issuedAt,
      }),
      signature: signature as `0x${string}`,
    });
  } catch {
    signedByCreator = false;
  }

  if (!signedByCreator) {
    return NextResponse.json(
      { error: "That signature does not match the creator wallet." },
      { status: 401 },
    );
  }

  // ── Authorisation, part two: did that address launch this token? ─────────
  let onChainCreator: string;
  try {
    const chain = createPublicClient({ chain: robinhoodChain, transport: http(RPC) });
    const launch = await chain.readContract({
      address: LAUNCHPAD_ADDRESS as `0x${string}`,
      abi: LAUNCHPAD_ABI,
      functionName: "launches",
      args: [getAddress(token)],
    });
    // The creator is the first field and has stayed first. Read by position
    // rather than by shape, so adding a field to the struct cannot break this.
    onChainCreator = (launch as readonly unknown[])[0] as string;
  } catch {
    return NextResponse.json({ error: "Could not reach the chain." }, { status: 502 });
  }

  if (getAddress(onChainCreator) !== getAddress(creator)) {
    return NextResponse.json(
      { error: "That wallet did not create this token." },
      { status: 403 },
    );
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error } = await db.from("token_metadata").upsert(
    {
      token_address: token.toLowerCase(),
      creator_address: creator.toLowerCase(),
      image_url: imageUrl ?? null,
      description: description ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token_address" },
  );

  if (error) return NextResponse.json({ error: "Could not save." }, { status: 502 });
  return NextResponse.json({ ok: true });
}

/**
 * An https image link and nothing else.
 *
 * Blocks `javascript:` and `data:`, which are not images but do render as
 * something when dropped into an attribute, and plain http, which would make
 * every page carrying the logo mixed content.
 */
function isSafeImageUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:" && value.length <= 2048;
  } catch {
    return false;
  }
}
