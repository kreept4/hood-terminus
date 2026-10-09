import { describe, expect, it } from "vitest";
import { venueName } from "./venue";

describe("venueName", () => {
  it("prefers the launchpad's own name", () => {
    expect(venueName("pons-v2-dex")).toBe("Pons");
    expect(venueName("bankr-robinhood")).toBe("Bankr");
  });

  it("turns a chain slug into something readable", () => {
    // The case that prompted this: the raw slug read as a sentence.
    expect(venueName("uniswap-v4-robinhood")).toBe("Uniswap v4");
    expect(venueName("uniswap-v3-robinhood")).toBe("Uniswap v3");
    expect(venueName("ramses-v3-robinhood")).toBe("Ramses v3");
  });

  it("keeps version markers lowercase and words capitalised", () => {
    expect(venueName("up-v3")).toBe("Up v3");
  });

  it("says something sayable when the dex is unknown", () => {
    expect(venueName(null)).toBe("another exchange");
  });
});
