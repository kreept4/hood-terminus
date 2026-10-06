import { describe, it, expect } from "vitest";
import { screen, type Pool } from "@/lib/market/gecko";
import sample from "@/lib/market/__fixtures__/pools.sample.json";

/**
 * The board's ordering, against a real snapshot.
 *
 * `pools.sample.json` is 130 live pools taken from the top, new and trending
 * feeds on 6 October 2026, deduplicated. 19 of them hold exactly zero
 * liquidity and 58 fall below the default $5k floor, which is what makes it
 * worth testing against rather than a handful of invented rows.
 */

const POOLS = sample as unknown as Pool[];

/** Pools that would be visible with the floor lowered to "Any". */
const ZERO_LIQ = POOLS.filter((p) => (p.liquidityUsd ?? 0) === 0);

describe("the fixture is worth testing against", () => {
  it("holds both dust and real liquidity", () => {
    expect(POOLS.length).toBe(130);
    expect(ZERO_LIQ.length).toBe(19);
    expect(Math.max(...POOLS.map((p) => p.liquidityUsd ?? 0))).toBeGreaterThan(
      20_000_000,
    );
  });
});

describe("the default floor keeps dust off every board", () => {
  const SORTS = ["trending", "new", "gainers", "losers", "volume", "liquidity"] as const;

  for (const sort of SORTS) {
    it(`${sort} shows nothing below $5k`, () => {
      const rows = screen(POOLS, { sort, minLiquidityUsd: 5_000, limit: 250 });
      const dust = rows.filter((r) => (r.liquidityUsd ?? 0) < 5_000);
      expect(dust).toEqual([]);
    });
  }
});

describe("liquidity and volume boards are ordered by their own measure", () => {
  it("liquidity descends", () => {
    const rows = screen(POOLS, { sort: "liquidity", minLiquidityUsd: 0, limit: 250 });
    const values = rows.map((r) => r.liquidityUsd ?? 0);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it("volume descends", () => {
    const rows = screen(POOLS, {
      sort: "volume",
      window: "24h",
      minLiquidityUsd: 0,
      limit: 250,
    });
    const values = rows.map((r) => r.volume["24h"] ?? 0);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });
});

/**
 * The reported defect, pinned so it cannot come back.
 *
 * With the floor at "Any", a pool holding nothing outranked pools holding
 * millions: on this snapshot a zero-liquidity pool ranked third on `gainers`
 * while one holding over $100,000 ranked sixty-fifth, and second against
 * fiftieth on `losers`.
 *
 * A pool with no liquidity has no meaningful percentage, because the smallest
 * possible trade moves its price arbitrarily far. It is noise at the top of a
 * board people read for signal, which is also the shape of a token nobody can
 * sell.
 */
describe("a pool with no market stays off the change boards", () => {
  for (const sort of ["gainers", "losers"] as const) {
    it(`${sort} excludes zero-liquidity pools even with the floor off`, () => {
      const rows = screen(POOLS, {
        sort,
        window: "24h",
        minLiquidityUsd: 0,
        limit: 250,
      });

      expect(rows.filter((r) => (r.liquidityUsd ?? 0) === 0)).toEqual([]);
    });

    it(`${sort} still returns funded movers`, () => {
      const rows = screen(POOLS, {
        sort,
        window: "24h",
        minLiquidityUsd: 0,
        limit: 250,
      });

      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => (r.liquidityUsd ?? 0) > 0)).toBe(true);
    });
  }

  it("ties on change break by liquidity, deeper market first", () => {
    const rows = screen(POOLS, {
      sort: "gainers",
      window: "24h",
      minLiquidityUsd: 0,
      limit: 250,
    });

    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1].change["24h"] ?? 0;
      const here = rows[i].change["24h"] ?? 0;
      if (prev !== here) continue;
      expect(rows[i - 1].liquidityUsd ?? 0).toBeGreaterThanOrEqual(
        rows[i].liquidityUsd ?? 0,
      );
    }
  });
});
