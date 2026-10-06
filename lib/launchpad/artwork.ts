import { createClient } from "@supabase/supabase-js";

/**
 * Artwork a creator uploaded for their own token.
 *
 * The launchpad stores no metadata URI on chain, so this table is the only
 * place a launched token's picture exists. Which means every surface that shows
 * a launched token has to ask for it: the curve board did, and the portfolio did
 * not, so a token you created and held rendered its own artwork on the board and
 * a monogram in your wallet.
 *
 * Never throws, and never blocks. A wallet that will not list your balances
 * because a picture table is unreachable has traded the important thing for the
 * cosmetic one.
 */
export type TokenArtwork = {
  imageUrl: string | null;
  description: string | null;
};

export async function getLaunchpadArtwork(
  addresses: string[],
): Promise<Map<string, TokenArtwork>> {
  const out = new Map<string, TokenArtwork>();

  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))].filter((a) =>
    /^0x[0-9a-f]{40}$/.test(a),
  );
  if (unique.length === 0) return out;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return out;

  try {
    const db = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await db
      .from("token_metadata")
      .select("token_address,image_url,description")
      .in("token_address", unique);

    for (const row of data ?? []) {
      out.set(row.token_address, {
        imageUrl: row.image_url,
        description: row.description,
      });
    }
  } catch {
    // Falls through to whatever the caller had: a feed image, or a monogram.
  }

  return out;
}
