import { describe, it, expect } from "vitest";
import { paymentProofHeaderName, settlementHeaderName } from "./protocol.js";
import type { X402Config } from "./types.js";

const base: X402Config = { payTo: "0xWallet", network: "base" };

describe("paymentProofHeaderName", () => {
  it("uses X-PAYMENT under wireVersion 1 (or when unset)", () => {
    expect(paymentProofHeaderName(base)).toBe("X-PAYMENT");
    expect(paymentProofHeaderName({ ...base, wireVersion: 1 })).toBe("X-PAYMENT");
  });

  it("uses PAYMENT-SIGNATURE under wireVersion 2", () => {
    expect(paymentProofHeaderName({ ...base, wireVersion: 2 })).toBe("PAYMENT-SIGNATURE");
  });
});

describe("settlementHeaderName", () => {
  it("uses X-PAYMENT-RESPONSE under wireVersion 1 (or when unset)", () => {
    expect(settlementHeaderName(base)).toBe("X-PAYMENT-RESPONSE");
    expect(settlementHeaderName({ ...base, wireVersion: 1 })).toBe("X-PAYMENT-RESPONSE");
  });

  it("uses PAYMENT-RESPONSE under wireVersion 2", () => {
    expect(settlementHeaderName({ ...base, wireVersion: 2 })).toBe("PAYMENT-RESPONSE");
  });
});
