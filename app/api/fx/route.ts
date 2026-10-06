/**
 * What a dollar is worth in the other currencies we display.
 *
 * Proxied through our own origin rather than fetched from the browser. Two
 * reasons, and the second is the real one: it keeps the rate provider off the
 * client's `connect-src` allowlist, and it means one cached call an hour serves
 * every visitor instead of every visitor making their own.
 *
 * Frankfurter publishes ECB reference rates, needs no key, and rates that move
 * a fraction of a percent a day do not need to be fresher than this.
 *
 * A failure here is not an error worth showing anyone. Rates fall back to
 * dollars only, which is what the product displayed before this existed.
 */

export const revalidate = 3600;

const FALLBACK = { USD: 1, GBP: 1, EUR: 1 };

export async function GET() {
  try {
    const r = await fetch(
      "https://api.frankfurter.app/latest?from=USD&to=GBP,EUR",
      { next: { revalidate: 3600 } },
    );
    if (!r.ok) throw new Error(String(r.status));

    const body = (await r.json()) as { rates?: Record<string, number> };
    const gbp = body.rates?.GBP;
    const eur = body.rates?.EUR;

    return Response.json({
      USD: 1,
      GBP: typeof gbp === "number" ? gbp : 1,
      EUR: typeof eur === "number" ? eur : 1,
    });
  } catch {
    // Deliberately a 200. A missing rate is a display detail, and a failing
    // request here should not surface as a broken panel.
    return Response.json(FALLBACK);
  }
}
