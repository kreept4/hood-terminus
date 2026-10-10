/**
 * What a pool is called, which is not always an address.
 *
 * A v2 pair and a v3 pool are contracts, so they have 20 byte addresses. A v4
 * pool is not a contract: it lives inside the PoolManager and is identified by
 * a 32 byte id derived from its key. On this chain most pools are v4, because
 * the launchpads run their markets through hooks.
 *
 * Validating a pool identifier as an address therefore rejects the majority of
 * this chain's markets. That is not hypothetical: `/api/candles` did exactly
 * that, so every timeframe button on a v4 token answered "Invalid pool address"
 * and the chart never changed. The page itself fetches its first candles on the
 * server, bypassing the route, which is why the chart looked fine until it was
 * touched.
 */
export function isPoolId(value: string): boolean {
  return /^0x(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/.test(value);
}
