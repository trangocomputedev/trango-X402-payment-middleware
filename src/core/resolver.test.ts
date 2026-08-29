import { describe, it, expect } from "vitest";
import { resolveAmount, getAmountParam } from "./resolver.js";

describe("resolveAmount — exact mode", () => {
  it("always uses the configured amount, ignoring requestedAmount", () => {
    const result = resolveAmount("0.25", "5.00");
    expect(result.payment.amount).toBe("0.25");
    expect(result.error).toBeUndefined();
  });
});

describe("resolveAmount — minimum mode", () => {
  const rule = { amount: "1.00", mode: "minimum" as const, description: "Support" };

  it("falls back to the minimum when no amount is requested", () => {
    const result = resolveAmount(rule, null);
    expect(result.payment.amount).toBe("1.00");
    expect(result.error).toBeUndefined();
  });

  it("accepts a requested amount at or above the minimum", () => {
    const result = resolveAmount(rule, "5.00");
    expect(result.payment.amount).toBe("5.00");
    expect(result.payment.description).toBe("Support");
    expect(result.error).toBeUndefined();
  });

  it("rejects a requested amount below the minimum", () => {
    const result = resolveAmount(rule, "0.50");
    expect(result.payment.amount).toBe("1.00");
    expect(result.error).toBe("Amount 0.50 USDC is below the minimum of 1.00 USDC");
  });

  it("rejects a non-numeric requested amount", () => {
    const result = resolveAmount(rule, "abc");
    expect(result.error).toMatch(/Invalid amount/);
  });

  it("rejects a zero or negative requested amount", () => {
    expect(resolveAmount(rule, "0").error).toMatch(/Invalid amount/);
    expect(resolveAmount(rule, "-5").error).toMatch(/Invalid amount/);
  });

  it("rejects more than 6 decimal places", () => {
    expect(resolveAmount(rule, "1.1234567").error).toMatch(/Invalid amount/);
  });
});

describe("resolveAmount — discovery passthrough", () => {
  const discovery = { method: "GET" as const };

  it("carries discovery config through in exact mode", () => {
    expect(resolveAmount({ amount: "0.25", discovery }, null).payment.discovery).toBe(discovery);
  });

  it("carries discovery config through in minimum mode regardless of requested amount", () => {
    const rule = { amount: "1.00", mode: "minimum" as const, discovery };
    expect(resolveAmount(rule, null).payment.discovery).toBe(discovery);
    expect(resolveAmount(rule, "5.00").payment.discovery).toBe(discovery);
  });
});

describe("getAmountParam", () => {
  it("defaults to 'amount'", () => {
    expect(getAmountParam({ amount: "1.00", mode: "minimum" })).toBe("amount");
  });

  it("uses a custom amountParam when configured", () => {
    expect(getAmountParam({ amount: "1.00", mode: "minimum", amountParam: "tip" })).toBe("tip");
  });
});
