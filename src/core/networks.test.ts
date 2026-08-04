import { describe, it, expect } from "vitest";
import { getNetworkConfig, toAtomicUnits } from "./networks.js";

describe("getNetworkConfig", () => {
  it("returns config for base", () => {
    expect(getNetworkConfig("base").chainId).toBe(8453);
  });

  it("returns config for base-sepolia", () => {
    expect(getNetworkConfig("base-sepolia").isTestnet).toBe(true);
  });

  it("throws for an unsupported network", () => {
    // @ts-expect-error — testing runtime guard against invalid input
    expect(() => getNetworkConfig("ethereum")).toThrow(/Unsupported network/);
  });
});

describe("toAtomicUnits", () => {
  it("converts a whole number amount", () => {
    expect(toAtomicUnits("1", 6)).toBe("1000000");
  });

  it("converts a fractional amount", () => {
    expect(toAtomicUnits("0.50", 6)).toBe("500000");
  });

  it("pads short fractions to full decimals", () => {
    expect(toAtomicUnits("0.25", 6)).toBe("250000");
  });

  it("truncates fractions longer than the decimal precision", () => {
    expect(toAtomicUnits("0.1234567", 6)).toBe("123456");
  });

  it("handles amounts with no fractional part", () => {
    expect(toAtomicUnits("2", 6)).toBe("2000000");
  });
});
