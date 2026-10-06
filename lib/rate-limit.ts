import "server-only";

/**
 * Rate limiting for the public API routes.
 *
 * In-memory, per instance. That is a real limitation and worth stating plainly:
 * on serverless, several instances can be live at once, so the effective limit
 * is the configured one multiplied by however many are running. It stops casual
 * abuse and accidental hammering. It does not stop someone determined.
 *
 * The proper version is a shared counter in Redis. This exists because the
 * routes it protects are genuinely expensive and shipping them with no limit at
 * all is worse than shipping them with an imperfect one.
 *
 * Why they need protecting:
 *
 *   /api/portfolio  fans out to roughly two hundred RPC calls per request. It
 *                   is the most expensive endpoint in the product by a wide
 *                   margin and it takes an address from anyone.
 *   /api/pools      proxies GeckoTerminal's free tier, whose limit is shared
 *                   across every visitor. One abusive client degrades the
 *                   boards for everybody.
 *   /api/candles    same upstream, same shared budget.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Cheap enough to run on every request, and keeps the map from growing. */
function sweep(now: number) {
  if (buckets.size < 5_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  /** Seconds until the window resets. For the Retry-After header. */
  retryAfter: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }

  bucket.count += 1;
  const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);

  if (bucket.count > limit) {
    return { ok: false, remaining: 0, retryAfter };
  }
  return { ok: true, remaining: limit - bucket.count, retryAfter };
}

/**
 * Who a request is from.
 *
 * `x-forwarded-for` can be spoofed in general, but on Vercel the platform
 * rewrites it at the edge, so the first entry is trustworthy there. The
 * fallback is a single shared bucket, which fails closed: an unidentifiable
 * flood is limited as one client rather than waved through as many.
 */
export function clientKey(request: Request, route: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return `${route}:${ip}`;
}

/** The 429 every limited route returns, headers included. */
export function tooManyRequests(retryAfter: number): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests" }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(retryAfter),
        "cache-control": "no-store",
      },
    },
  );
}
