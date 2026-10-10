import { describe, expect, it } from "vitest";
import { isPoolId } from "./pool-id";

describe("isPoolId", () => {
  it("accepts a 20 byte pool address, which is v2 and v3", () => {
    expect(isPoolId("0x52e65b17fb6e5ba00ed806f37afcd2daa50271ca")).toBe(true);
  });

  it("accepts a 32 byte v4 pool id", () => {
    // The case that was rejected: every launchpad pair on this chain.
    expect(
      isPoolId(
        "0x88401f04a9af8326ccd642d64192442875d8378f7f5b324ac2449c481831ff9b",
      ),
    ).toBe(true);
  });

  it("does not care about case", () => {
    expect(isPoolId("0x52E65B17FB6E5BA00ED806F37AFCD2DAA50271CA")).toBe(true);
  });

  it("rejects lengths that are neither", () => {
    expect(isPoolId("0x52e65b17")).toBe(false);
    expect(isPoolId(`0x${"a".repeat(63)}`)).toBe(false);
    expect(isPoolId(`0x${"a".repeat(41)}`)).toBe(false);
  });

  it("rejects anything that is not hex, or missing its prefix", () => {
    expect(isPoolId("52e65b17fb6e5ba00ed806f37afcd2daa50271ca")).toBe(false);
    expect(isPoolId("0xzz65b17fb6e5ba00ed806f37afcd2daa50271ca")).toBe(false);
    expect(isPoolId("")).toBe(false);
  });
});
